// The name dictionary: finds player and club names in text, and resolves the
// names tools are called with.
//
// A player can be written many ways. FPL's own data gives "B.Fernandes"
// (web_name), "Bruno" + "Borges Fernandes" (first and second name) and
// sometimes a known_name; a recap will say "Bruno Fernandes" or "Fernandes".
// So a run of capitalised words matches a player when every word is part of
// that player's names. Matching ignores accents ("Odegaard" finds "Ødegaard")
// but not capitals: "White" can be Ben White, "white" never is.

import type { NameEntry } from "./context";

export interface NameMention {
  kind: "player" | "team";
  /** Every player or team the words could mean. */
  ids: number[];
  /** The subset whose usual name (web_name, known_name, full name, surname) is exactly these words. */
  exactIds: number[];
  text: string;
  start: number;
  end: number;
  /**
   * A club nickname ("City", "United") that more than one club in the
   * dictionary could answer to. `ids` lists them all, even when only one is
   * in the league, so the checker always confirms which club is meant.
   */
  sharedNickname?: boolean;
  /**
   * A single word that opens a sentence and might not be a name at all: a
   * first name ("Will ..."), or a surname that is also an ordinary word
   * ("Young ...", "White ..."). Only trust it when the evidence agrees.
   */
  weak: boolean;
}

/** A capitalised word (or run of them) that is no known player, club or allowed term. */
export interface UnknownName {
  text: string;
  start: number;
  end: number;
}

export interface NameScan {
  mentions: NameMention[];
  unknown: UnknownName[];
}

export interface NameIndex {
  /** Finds every player and club named in the text, and capitalised words that are neither. */
  scan(text: string): NameScan;
  /** Players a name could mean, best matches only: exact names first, otherwise any player with all the words. */
  lookupPlayer(query: string): number[];
  /** The team with this name, short name or common alias, if any. */
  lookupTeam(query: string): number | null;
}

/** Longer or more formal names for clubs FPL abbreviates, keyed by FPL's team name. */
export const TEAM_ALIASES: Record<string, string[]> = {
  "Man City": ["Manchester City"],
  "Man Utd": ["Manchester United", "Man United"],
  Spurs: ["Tottenham", "Tottenham Hotspur"],
  "Nott'm Forest": ["Nottingham Forest", "Forest"],
  Wolves: ["Wolverhampton", "Wolverhampton Wanderers"],
  Newcastle: ["Newcastle United"],
  "West Ham": ["West Ham United"],
  Leeds: ["Leeds United"],
  "Aston Villa": ["Villa"],
  "Crystal Palace": ["Palace"],
  Brighton: ["Brighton and Hove Albion"],
  Leicester: ["Leicester City"],
  "Sheffield Utd": ["Sheffield United"],
  "West Brom": ["West Bromwich Albion", "West Bromwich"],
};

/**
 * The one-word nicknames several clubs answer to, keyed by FPL's team name.
 * "City" is Man City to most readers, but Hull City and Coventry City are
 * "City" too, so these are never taken on trust: the index reports every club
 * in the dictionary that shares the nickname, and the checker accepts it only
 * when the recap itself makes clear which one is meant (see `sharedNickname`
 * on a mention). Clubs FPL names "X City" or "X United" get theirs from the
 * name, so only the clubs FPL abbreviates are listed.
 */
export const SHARED_NICKNAMES: Record<string, string[]> = {
  "Man City": ["City"],
  Leicester: ["City"],
  "Man Utd": ["United"],
  Newcastle: ["United"],
  Leeds: ["United"],
  "West Ham": ["United"],
  "Sheffield Utd": ["United"],
};

/** "Coventry City" is also "Coventry". */
const CLUB_SUFFIX = /^(.{4,}) (City|Town|United|Albion|Wanderers|Athletic|Rovers|County)$/;
/** The suffixes that double as a nickname on their own ("City", "United"). */
const NICKNAME_SUFFIXES = new Set(["City", "United"]);

/** Capitalised words a recap may use that are not names. */
export const ALLOWED_CAPITALISED = new Set(
  [
    "gameweek gameweeks fpl fantasy premier league double blank triple captain captains bench boost free hit",
    "wildcard wildcards dream team i",
    "monday tuesday wednesday thursday friday saturday sunday",
    "january february march april may june july august september october november december",
    "christmas boxing day new year easter",
  ]
    .join(" ")
    .split(" "),
);

/** Surnames in the Premier League that are also ordinary words, so they prove nothing at the start of a sentence. */
const ORDINARY_WORDS = new Set(
  [
    "young white wood woods long king gray grey brown black green field fields bench good best little short cash",
    "hall head hill lane strong sharp swift small savage stones rice son wing bird bell cook cross day fox",
    "gold hand hope house keen kite lamb law love moon moore park price rose ward west north south east",
    "winter summer spring march may will mark max art chance",
  ]
    .join(" ")
    .split(" "),
);

/** Lower-case name particles: never enough to identify anyone, and skipped inside a name. */
const PARTICLES = new Set(
  "de da do dos das del della di van von der den ten ter la le el al bin y e jr".split(" "),
);

const LETTER_MAP: Record<string, string> = {
  ø: "o", Ø: "O", đ: "d", Đ: "D", ł: "l", Ł: "L", ß: "ss", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE",
  ı: "i", İ: "I", þ: "th", Þ: "Th", ð: "d", Ð: "D", "’": "'", "‘": "'", "ʼ": "'",
};

/** Removes accents and unusual letters, keeping case and length-insensitive meaning ("Ødegaard" becomes "Odegaard"). */
export function fold(text: string): string {
  return text
    .replace(/[øØđĐłŁßæÆœŒıİþÞðÐ’‘ʼ]/g, (c) => LETTER_MAP[c] ?? c)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/** The words of a name as lower-case keys, without initials ("B.") and particles ("de"). */
export function nameTokens(name: string): string[] {
  const words = fold(name)
    .split(/[\s.\-]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
  const strong = words.filter((w) => w.length > 1 && !PARTICLES.has(w));
  return strong.length > 0 ? strong : words.filter((w) => w.length > 1);
}

interface Word {
  /** Lower-case, folded, without a possessive ending. */
  key: string;
  start: number;
  end: number;
  kind: "title" | "caps" | "particle" | "other";
  possessive: boolean;
  sentenceInitial: boolean;
  /** Only spaces, hyphens or an initial's full stop separate this word from the previous one. */
  joinsPrevious: boolean;
}

/** The text between two words ends a sentence: punctuation then a space, a spaced dash, or a new line. */
const SENTENCE_BREAK = /(?:[.!?:;]["'”’)\]]*\s|\n|\s[\u2013\u2014-]\s)[\s"'“‘(\[]*$/;

const WORD = /[\p{L}\p{N}]+(?:['’‘ʼ][\p{L}]+)*/gu;

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  let previousEnd = 0;
  for (const match of text.matchAll(WORD)) {
    let raw = match[0];
    const start = match.index;
    let possessive = false;
    const ending = /['’‘ʼ]s$/i.exec(raw);
    if (ending) {
      raw = raw.slice(0, -2);
      possessive = true;
    }
    const end = start + raw.length;
    const gap = text.slice(previousEnd, start);
    const folded = fold(raw);

    let kind: Word["kind"] = "other";
    if (/\p{N}/u.test(folded)) kind = "other";
    else if (/^\p{Lu}/u.test(folded) && /\p{Ll}/u.test(folded)) kind = "title";
    else if (folded.length >= 2 && folded === folded.toUpperCase() && /^\p{Lu}+$/u.test(folded)) kind = "caps";
    else if (PARTICLES.has(folded.toLowerCase())) kind = "particle";

    words.push({
      key: folded.toLowerCase(),
      start,
      end,
      kind,
      possessive,
      // The start of the text, or after sentence punctuation and a space.
      sentenceInitial: words.length === 0 || SENTENCE_BREAK.test(gap),
      joinsPrevious: words.length > 0 && /^(?:[\s\-]+|\.)$/.test(gap),
    });
    previousEnd = match.index + match[0].length;
  }
  return words;
}

const unique = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);

export function createNameIndex(entries: readonly NameEntry[]): NameIndex {
  /** Phrase ("man city") -> team ids. */
  const teamPhrases = new Map<string, number[]>();
  /** Nicknames ("city") that must be confirmed against the recap, whether or not two clubs share them this season. */
  const sharedNicknames = new Set<string>();
  /** Short name ("mci") -> team id. */
  const teamShort = new Map<string, number>();
  /** Phrase -> players usually called exactly that. */
  const exact = new Map<string, number[]>();
  /** FPL's display name, written out in full ("b.fernandes") -> the players shown under it. */
  const displayed = new Map<string, number[]>();
  /** Word -> players with that word anywhere in their names. */
  const postings = new Map<string, Set<number>>();

  const add = (map: Map<string, number[]>, key: string, id: number) => {
    if (!key) return;
    const ids = map.get(key);
    if (!ids) map.set(key, [id]);
    else if (!ids.includes(id)) ids.push(id);
  };

  for (const entry of entries) {
    if (entry.kind === "team") {
      const names = [entry.name, ...(TEAM_ALIASES[entry.name] ?? [])];
      const stem = CLUB_SUFFIX.exec(entry.name);
      if (stem) names.push(stem[1]);
      const nicknames = [...(SHARED_NICKNAMES[entry.name] ?? []), ...(stem && NICKNAME_SUFFIXES.has(stem[2]) ? [stem[2]] : [])];
      for (const name of names) add(teamPhrases, phraseKey(name), entry.id);
      for (const nickname of nicknames) {
        add(teamPhrases, phraseKey(nickname), entry.id);
        sharedNicknames.add(phraseKey(nickname));
      }
      teamShort.set(entry.shortName.toLowerCase(), entry.id);
      continue;
    }
    const full = `${entry.firstName} ${entry.secondName}`;
    add(displayed, literalKey(entry.webName), entry.id);
    for (const name of [entry.webName, entry.knownName, full, entry.secondName]) {
      add(exact, nameTokens(name).join(" "), entry.id);
    }
    for (const token of nameTokens(`${full} ${entry.webName} ${entry.knownName}`)) {
      let ids = postings.get(token);
      if (!ids) postings.set(token, (ids = new Set()));
      ids.add(entry.id);
    }
  }

  /** Players whose names contain every one of these words. */
  function loose(tokens: readonly string[]): number[] {
    let result: number[] | null = null;
    for (const token of tokens) {
      const ids = postings.get(token);
      if (!ids) return [];
      result = result === null ? [...ids] : result.filter((id) => ids.has(id));
      if (result.length === 0) return [];
    }
    return unique(result ?? []);
  }

  function lookupPlayer(query: string): number[] {
    // A display name with its initial ("B.Fernandes") means that player, not
    // every Fernandes. A bare "Fernandes" stays ambiguous.
    const shown = query.includes(".") ? displayed.get(literalKey(query)) : undefined;
    if (shown?.length) return unique(shown);
    const tokens = nameTokens(query);
    if (tokens.length === 0) return [];
    const exactIds = exact.get(tokens.join(" "));
    return exactIds?.length ? unique(exactIds) : loose(tokens);
  }

  function lookupTeam(query: string): number | null {
    const short = teamShort.get(query.trim().toLowerCase());
    if (short !== undefined) return short;
    const key = phraseKey(query);
    // A shared nickname ("City") is never a way to ask for a club, even when one club has it this season.
    if (sharedNicknames.has(key)) return null;
    const ids = teamPhrases.get(key);
    return ids?.length === 1 ? ids[0] : null;
  }

  function scan(text: string): NameScan {
    const words = wordsOf(text);
    const mentions: NameMention[] = [];
    const unknown: UnknownName[] = [];

    let i = 0;
    while (i < words.length) {
      const word = words[i];
      if (word.kind === "caps") {
        const team = teamShort.get(word.key);
        if (team !== undefined) {
          mentions.push({ kind: "team", ids: [team], exactIds: [team], text: text.slice(word.start, word.end), start: word.start, end: word.end, weak: false });
        }
        i++;
        continue;
      }
      if (word.kind !== "title") {
        i++;
        continue;
      }

      // A run: capitalised words in a row, possibly with particles between
      // them ("Virgil van Dijk"), ended by punctuation or a possessive.
      const run: Word[] = [word];
      let j = i + 1;
      while (!run.at(-1)!.possessive && j < words.length) {
        let k = j;
        while (k < words.length && words[k].kind === "particle" && words[k].joinsPrevious && !words[k].possessive) k++;
        if (k < words.length && words[k].kind === "title" && words[k].joinsPrevious) {
          run.push(words[k]);
          j = k + 1;
        } else break;
      }
      i = j;

      // Split the run into the longest known names.
      type Segment =
        | { type: "mention"; mention: NameMention; words: number }
        | { type: "unknown"; start: number; end: number }
        | { type: "ordinary" };
      const segments: Segment[] = [];
      let at = 0;
      while (at < run.length) {
        let matched = 0;
        for (let length = Math.min(5, run.length - at); length >= 1 && !matched; length--) {
          const span = run.slice(at, at + length);
          const keys = span.map((w) => w.key);
          const first = span[0];
          const last = span.at(-1)!;
          const base = { text: text.slice(first.start, last.end), start: first.start, end: last.end };

          const teams = teamPhrases.get(keys.join(" "));
          if (teams) {
            const sharedNickname = sharedNicknames.has(keys.join(" "));
            segments.push({
              type: "mention",
              words: length,
              mention: { kind: "team", ids: unique(teams), exactIds: unique(teams), ...base, weak: false, ...(sharedNickname ? { sharedNickname } : {}) },
            });
            matched = length;
            break;
          }
          if (length === 1 && ALLOWED_CAPITALISED.has(first.key)) break;
          // Particles don't count towards a player's name ("De Bruyne" is "bruyne").
          const tokens = keys.filter((k) => !PARTICLES.has(k));
          if (tokens.length === 0) continue;
          let exactIds = unique(exact.get(tokens.join(" ")) ?? []);
          let ids = unique([...exactIds, ...loose(tokens)]);
          // "B.Fernandes", initial and all, is one player's display name: it
          // doesn't also mean every other Fernandes.
          if (/^\p{Lu}\.$/u.test(text.slice(Math.max(0, first.start - 2), first.start))) {
            const shown = displayed.get(literalKey(text.slice(first.start - 2, last.end)));
            if (shown?.length) {
              ids = exactIds = unique(shown);
              base.text = text.slice(first.start - 2, last.end);
              base.start = first.start - 2;
            }
          }
          if (ids.length > 0) {
            const weak =
              length === 1 && first.sentenceInitial && (exactIds.length === 0 || ORDINARY_WORDS.has(first.key));
            segments.push({ type: "mention", words: length, mention: { kind: "player", ids, exactIds, ...base, weak } });
            matched = length;
          }
        }
        if (matched) {
          at += matched;
          continue;
        }
        const lone = run[at];
        const ordinary = ALLOWED_CAPITALISED.has(lone.key) || PARTICLES.has(lone.key);
        // A sentence's first word is capitalised whatever it is, so on its own
        // it proves nothing. A possessive ("Guardiola's side") is still a name.
        const excused = lone.sentenceInitial && !lone.possessive;
        segments.push(ordinary || excused ? { type: "ordinary" } : { type: "unknown", start: lone.start, end: lone.end });
        at++;
      }

      // "Pep Guardiola" and "John Smith" are each one person, and not one in
      // the dictionary, even if "Pep", "John" or "Smith" is some player's
      // name. So neighbouring single words that don't add up to one known
      // name are reported together as an unknown name.
      const single = (g: Segment) => g.type === "mention" && g.mention.kind === "player" && g.words === 1;
      for (let a = 0; a < segments.length; ) {
        let b = a;
        while (b < segments.length && (segments[b].type === "unknown" || single(segments[b]))) b++;
        const group = segments.slice(a, b);
        const stranger = group.length >= 2 || group.some((g) => g.type === "unknown");
        if (group.length > 0 && stranger) {
          const edge = (g: Segment) => (g.type === "mention" ? g.mention : (g as { start: number; end: number }));
          const from = edge(group[0]).start;
          const to = edge(group.at(-1)!).end;
          unknown.push({ text: text.slice(from, to), start: from, end: to });
        } else {
          for (const g of group) if (g.type === "mention") mentions.push(g.mention);
        }
        if (b === a) {
          const g = segments[a];
          if (g.type === "mention") mentions.push(g.mention);
          b = a + 1;
        }
        a = b;
      }
    }
    return { mentions, unknown };
  }

  return { scan, lookupPlayer, lookupTeam };
}

/** A display name as written, as a lookup key: "B.Fernandes" -> "b.fernandes". */
function literalKey(name: string): string {
  return fold(name).toLowerCase().trim().replace(/\s+/g, " ");
}

/** A club name as a lookup key: folded, lower-case, single spaces. */
function phraseKey(name: string): string {
  return fold(name).toLowerCase().split(/[\s\-]+/).filter(Boolean).join(" ");
}
