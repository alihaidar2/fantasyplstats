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
  "Man Utd": ["Manchester United"],
  Spurs: ["Tottenham", "Tottenham Hotspur"],
  "Nott'm Forest": ["Nottingham Forest", "Forest"],
  Wolves: ["Wolverhampton", "Wolverhampton Wanderers"],
  Newcastle: ["Newcastle United"],
  "West Ham": ["West Ham United"],
  Leeds: ["Leeds United"],
  "Aston Villa": ["Villa"],
  "Crystal Palace": ["Palace"],
};

/** "Coventry City" is also "Coventry". */
const CLUB_SUFFIX = /^(.{4,}) (City|Town|United|Albion|Wanderers|Athletic|Rovers|County)$/;

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
  /** Short name ("mci") -> team id. */
  const teamShort = new Map<string, number>();
  /** Phrase -> players usually called exactly that. */
  const exact = new Map<string, number[]>();
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
      for (const name of names) add(teamPhrases, phraseKey(name), entry.id);
      teamShort.set(entry.shortName.toLowerCase(), entry.id);
      continue;
    }
    const full = `${entry.firstName} ${entry.secondName}`;
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
    const tokens = nameTokens(query);
    if (tokens.length === 0) return [];
    const exactIds = exact.get(tokens.join(" "));
    return exactIds?.length ? unique(exactIds) : loose(tokens);
  }

  function lookupTeam(query: string): number | null {
    const short = teamShort.get(query.trim().toLowerCase());
    if (short !== undefined) return short;
    const ids = teamPhrases.get(phraseKey(query));
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
            mentions.push({ kind: "team", ids: unique(teams), exactIds: unique(teams), ...base, weak: false });
            matched = length;
            break;
          }
          // Particles don't count towards a player's name ("De Bruyne" is "bruyne").
          const tokens = keys.filter((k) => !PARTICLES.has(k));
          if (tokens.length === 0) continue;
          const exactIds = unique(exact.get(tokens.join(" ")) ?? []);
          const ids = unique([...exactIds, ...loose(tokens)]);
          if (ids.length > 0) {
            const weak =
              length === 1 && first.sentenceInitial && (exactIds.length === 0 || ORDINARY_WORDS.has(first.key));
            if (!(length === 1 && ALLOWED_CAPITALISED.has(first.key))) {
              mentions.push({ kind: "player", ids, exactIds, ...base, weak });
            }
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
        if (!ordinary && !excused) {
          const previous = unknown.at(-1);
          if (previous && at > 0 && previous.end === run[at - 1].end) {
            previous.text = text.slice(previous.start, lone.end);
            previous.end = lone.end;
          } else {
            unknown.push({ text: text.slice(lone.start, lone.end), start: lone.start, end: lone.end });
          }
        }
        at++;
      }
    }
    return { mentions, unknown };
  }

  return { scan, lookupPlayer, lookupTeam };
}

/** A club name as a lookup key: folded, lower-case, single spaces. */
function phraseKey(name: string): string {
  return fold(name).toLowerCase().split(/[\s\-]+/).filter(Boolean).join(" ");
}
