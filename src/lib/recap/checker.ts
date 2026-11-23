// The checker: decides, without any AI, whether a recap says only what the
// tools returned. Its messages go back to the agent, so each one names the
// exact words at fault and what to do about them.
//
// What it verifies:
// - Numbers. Every number in the text (points, prices, percentages, scores,
//   counts, "twice", "hat-trick") must be in a tool result. A claim's numbers
//   must be in the results that claim cites. Numbers in the headline and
//   paragraphs must also be stated by a claim.
// - What it is a number of. A number next to a stat word ("two assists",
//   "17 pts", "a brace", "an xG of 0.82") must match a figure of that stat:
//   tool results are tagged by field name (stats.ts). "Three assists" is not
//   satisfied by a 3 that is the player's bonus.
// - Whose number it is. Tool results keep each player's numbers inside that
//   player's object. A number in a sentence that names a player must be one
//   of that player's own figures: not another player's, not their club's and
//   not the gameweek's (the average score, say). A gameweek-wide figure may
//   sit beside a player's name only when the words make it one ("the average
//   manager scored", "there were four red cards", "14 players", a chip). A
//   score next to a club must be one of that club's results.
// - When it is from. A season total, or a figure from an earlier gameweek,
//   only counts when the sentence says so ("this season", "in Gameweek 2").
// - Names. Every player or club named must be in a tool result. Any other
//   capitalised name (a manager, a pundit, a stadium, an FPL manager's real
//   name) is rejected, since nothing in the data could have supplied it.
// - Content. Length limits; nothing about betting or odds; no links; no
//   quotes.
//
// Known gaps. These are for the quality review and the person approving the
// recap:
// - A false statement built from true numbers of the right stat about the
//   right player ("his first goal" when it was his third).
// - Two players in one sentence: a number may belong to either, so stats
//   swapped inside a single sentence pass unless written in brackets after
//   each name ("Saka (12 points) and Rice (9 points)").
// - A number with no stat word the lexicon knows ("finished on 9") is only
//   checked for being one of the player's figures, whatever the stat. In a
//   sentence that names no player it can be any figure in the evidence.
// - Season words anywhere in a sentence ("this season", "so far", "since")
//   open season totals to every number in it.
// - Club figures are not tied to the club named: a sentence about one club
//   can use another club's league points. (Scores are tied to clubs.)
// - "One", and "a goal" or "an assist", are not read as numbers.
// - A lone unknown surname as the first word of a sentence ("Guardiola
//   rotated again.") can't be told from an ordinary capitalised word.
//
// It errs towards rejecting: a club or gameweek figure in a sentence that
// names a player is refused even when the sentence means the club. The
// message says to give such figures a sentence of their own.

import type { NameEntry } from "./context";
import type { NameIndex, NameMention } from "./names";
import { extractNumbers, numberToken, numbersAgree, type NumberToken } from "./numbers";
import {
  PART_POINTS,
  SEASON_WORDS,
  isGameweekField,
  isSeasonField,
  statLabel,
  statsOfField,
  writtenStat,
} from "./stats";
import {
  RECAP_LIMITS,
  type CheckIssue,
  type CheckReport,
  type EvidenceEntry,
  type RecapDraft,
  type RecapLimits,
} from "./recap";

export interface CheckOptions {
  /** "2026-27" */
  season: string;
  gameweek: number;
  /** Every tool call the agent made. Failed calls and submit_recap calls are not evidence. */
  evidence: readonly EvidenceEntry[];
  names: NameIndex;
  /** The same dictionary as `names`, to name players in messages. */
  nameEntries: readonly NameEntry[];
  limits?: Partial<RecapLimits>;
  /** Real names that must never appear, e.g. the members of a mini-league. Matched ignoring case. */
  forbiddenNames?: readonly string[];
  /** Numbers in the headline and paragraphs must also appear in a claim. Default true. */
  requireClaimCoverage?: boolean;
}

/** A number in a tool result: what it counts and who it is about. */
interface Fact {
  token: NumberToken;
  /** The players it describes, or null when it is no player's figure. */
  owners: readonly number[] | null;
  /** The club it describes, when it is a club's figure (inside team_story) rather than a player's or the gameweek's. */
  team: number | null;
  /** The field it sits in, e.g. "assists". */
  field: string;
  /** The stats that field counts as (see stats.ts); empty when untyped. */
  stats: readonly string[];
  /** A season-to-date figure (inside `season`, `seasonLeaders`, ...) rather than this gameweek's. */
  season: boolean;
  /** The gameweek its row says it is about (rows of a season list do), or null: this gameweek. */
  gameweek: number | null;
}

interface MatchResult {
  homeId: number | null;
  awayId: number | null;
  /** "Arsenal 2-1 Chelsea" */
  text: string;
  /** Set when the result says which gameweek the match was in (season lists do). */
  gameweek: number | null;
  token: NumberToken;
  owners: readonly number[] | null;
}

/** Everything one tool result says, indexed for checking. */
interface ResultFacts {
  id: string;
  numbers: Fact[];
  matches: MatchResult[];
  players: Set<number>;
  teams: Set<number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a tool result, following the conventions in tools/shared.ts. */
function readResult(entry: EvidenceEntry, names: NameIndex): ResultFacts {
  const facts: ResultFacts = { id: entry.id, numbers: [], matches: [], players: new Set(), teams: new Set() };

  interface Place {
    owners: readonly number[] | null;
    team: number | null;
    field: string;
    stats: readonly string[];
    season: boolean;
    gameweek: number | null;
  }

  const walk = (value: unknown, place: Place): void => {
    if (typeof value === "number") {
      const token = numberToken(value);
      // "gameweek": 3 says which gameweek a row is about. It is not a count of anything.
      facts.numbers.push({ ...place, token: isGameweekField(place.field) ? { ...token, kind: "gameweek" } : token });
    } else if (typeof value === "string") {
      for (const token of extractNumbers(value)) facts.numbers.push({ ...place, token });
      for (const mention of names.scan(value).mentions) {
        const seen = mention.kind === "team" ? facts.teams : facts.players;
        for (const id of mention.ids) seen.add(id);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, place);
    } else if (isRecord(value)) {
      let { owners, team, season, gameweek } = place;
      if (typeof value.gameweek === "number") gameweek = value.gameweek;
      // expected_vs_actual says in `scope` whether its rows are season totals.
      if (typeof value.scope === "string" && /season/i.test(value.scope)) season = true;
      if (typeof value.player === "string") {
        // A player's object: every number inside it is about that player.
        const ref = typeof value.ref === "string" ? /^p(\d+)$/.exec(value.ref) : null;
        owners = ref ? [Number(ref[1])] : names.lookupPlayer(value.player);
        for (const id of owners) facts.players.add(id);
      } else if (typeof value.team === "string") {
        // A club's object (team_story): its numbers are the club's.
        team = names.lookupTeam(value.team);
      }
      if (typeof value.home === "string" && typeof value.away === "string" && typeof value.score === "string") {
        const token = extractNumbers(value.score).find((t) => t.kind === "score");
        if (token) {
          facts.matches.push({
            homeId: names.lookupTeam(value.home),
            awayId: names.lookupTeam(value.away),
            text: `${value.home} ${value.score} ${value.away}`,
            gameweek: typeof value.gameweek === "number" ? value.gameweek : null,
            token,
            owners,
          });
        }
      }
      for (const [field, child] of Object.entries(value)) {
        if (field === "ref" || field === "player") continue;
        // A nested object or list keeps its own field names; a number or string takes this one.
        walk(child, {
          owners,
          team,
          field,
          stats: statsOfField(field, value),
          season: season || isSeasonField(field),
          gameweek,
        });
      }
    }
  };
  walk(entry.result, { owners: null, team: null, field: "", stats: [], season: false, gameweek: null });
  return facts;
}

const BETTING =
  /\b(?:bet|bets|betting|bettors?|bookmakers?|bookies?|odds|odds-on|wagers?|wagered|wagering|gambl\w*|sportsbooks?|accumulators?|acca|each-way|punters?)\b/gi;
/** Fractional odds such as "5/1", but not a season such as "2026/27". */
const FRACTIONAL_ODDS = /(?<![\d/])\d{1,3}\/\d{1,2}(?![\d/])/g;
const LINK =
  /https?:\/\/\S+|\bwww\.\S+|\[[^\]]+\]\([^)]*\)|\b[\w.+-]+@[\w-]+\.\w+|\b[a-z0-9-]+\.(?:com|co\.uk|org|net|io|app|tv|gg|uk)\b/gi;
/** A quoted passage of a few words or more: nobody in the data said anything. */
const QUOTE = /["“][^"“”]{12,}["”]/g;

interface Sentence {
  start: number;
  end: number;
}

/** Splits at sentence punctuation followed by a space and a capital. Decimals and "B.Fernandes" don't split. */
function sentencesOf(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]["'”’)\]]*\s+(?=["'“‘(\[]*\p{Lu})/gu)) {
    const end = match.index + match[0].trimEnd().length;
    sentences.push({ start, end });
    start = match.index + match[0].length;
  }
  if (start < text.length) sentences.push({ start, end: text.length });
  return sentences;
}

const quoted = (text: string) => `"${text.trim()}"`;

function excerpt(text: string, sentence: Sentence): string {
  const s = text.slice(sentence.start, sentence.end).trim();
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

const list = (items: readonly string[], max = 4) =>
  items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");

export function checkRecap(draft: RecapDraft, options: CheckOptions): CheckReport {
  const limits: RecapLimits = { ...RECAP_LIMITS, ...options.limits };
  const { names } = options;
  const issues: CheckIssue[] = [];
  const seen = new Set<string>();
  const report = (code: string, where: string, message: string) => {
    const key = `${code}|${where}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, where, message });
  };
  let numbersChecked = 0;
  let namesChecked = 0;
  /** Numbers already reported as absent from the evidence, so they aren't reported twice. */
  const unsupported = new Set<string>();

  const playerNames = new Map<number, string>();
  const teamNames = new Map<number, string>();
  for (const entry of options.nameEntries) {
    if (entry.kind === "player") playerNames.set(entry.id, entry.webName);
    else teamNames.set(entry.id, entry.name);
  }

  const usable = options.evidence.filter((e) => e.ok && e.tool !== "submit_recap");
  const allFacts = usable.map((e) => readResult(e, names));
  const factsById = new Map(allFacts.map((f) => [f.id, f]));

  // ---- Length ------------------------------------------------------------
  const headline = draft.headline.trim();
  if (headline.length < limits.headlineMinChars || headline.length > limits.headlineMaxChars) {
    report(
      "length",
      "headline",
      `The headline is ${headline.length} characters. Keep it between ${limits.headlineMinChars} and ${limits.headlineMaxChars}.`,
    );
  }
  if (draft.paragraphs.length < limits.minParagraphs || draft.paragraphs.length > limits.maxParagraphs) {
    report(
      "length",
      "recap",
      `The recap has ${draft.paragraphs.length} paragraphs. Write between ${limits.minParagraphs} and ${limits.maxParagraphs}.`,
    );
  }
  draft.paragraphs.forEach((paragraph, i) => {
    if (paragraph.trim().length === 0) report("length", `paragraph ${i + 1}`, "This paragraph is empty.");
    if (paragraph.length > limits.paragraphMaxChars) {
      report(
        "length",
        `paragraph ${i + 1}`,
        `This paragraph is ${paragraph.length} characters. Keep each paragraph under ${limits.paragraphMaxChars}.`,
      );
    }
  });
  const words = draft.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  if (words < limits.minWords || words > limits.maxWords) {
    report(
      "length",
      "recap",
      `The paragraphs total ${words} words. Write between ${limits.minWords} and ${limits.maxWords}.`,
    );
  }
  if (draft.claims.length < limits.minClaims || draft.claims.length > limits.maxClaims) {
    report(
      "length",
      "recap",
      `There are ${draft.claims.length} claims. Give between ${limits.minClaims} and ${limits.maxClaims}.`,
    );
  }

  // ---- One piece of text against the results it may draw on ----------------
  const checkText = (where: string, text: string, scope: readonly ResultFacts[], cited: readonly string[] | null) => {
    const source = cited ? `the results this claim cites (${cited.join(", ") || "none"})` : "any tool result";

    for (const match of text.matchAll(BETTING)) {
      report("betting", where, `Remove ${quoted(match[0])}: a recap must not mention betting or odds.`);
    }
    for (const match of text.matchAll(FRACTIONAL_ODDS)) {
      report("betting", where, `Remove ${quoted(match[0])}: it reads as betting odds, which a recap must not mention.`);
    }
    for (const match of text.matchAll(LINK)) {
      report("link", where, `Remove ${quoted(match[0])}: a recap must not contain links or addresses.`);
    }
    for (const match of text.matchAll(QUOTE)) {
      report("quote", where, `Remove the quotation ${match[0]}: the data contains no quotes, so a recap can't have any.`);
    }
    for (const name of options.forbiddenNames ?? []) {
      if (name.trim() && text.toLowerCase().includes(name.trim().toLowerCase())) {
        report("real-name", where, `Remove ${quoted(name)}: a recap must never give a manager's real name.`);
      }
    }

    // Names.
    const scan = names.scan(text);
    if (scan.unknown.length > 0) {
      report(
        "unknown-name",
        where,
        `${list(scan.unknown.map((u) => quoted(u.text)))} ${scan.unknown.length === 1 ? "is" : "are"} not a player or club in the data. ` +
          "Only name players and clubs that a tool returned: no managers (of clubs or of FPL teams), pundits, stadiums, " +
          "nationalities or other competitions. Name players the way the tools do, and write ordinary words in lower " +
          "case (sentence case, not Title Case).",
      );
    }
    const inScope = (mention: NameMention, ids: readonly number[]) =>
      ids.filter((id) => scope.some((f) => (mention.kind === "team" ? f.teams : f.players).has(id)));
    /** The mentions that really are names here, each narrowed to who it means given the evidence. */
    const mentions: { mention: NameMention; ids: number[] }[] = [];
    for (const mention of scan.mentions) {
      const exact = inScope(mention, mention.exactIds);
      const ids = exact.length > 0 ? exact : inScope(mention, mention.ids);
      if (ids.length > 0) {
        namesChecked++;
        mentions.push({ mention, ids });
        continue;
      }
      // A capitalised first word that is only maybe a name: let it go.
      if (mention.weak) continue;
      namesChecked++;
      const elsewhere = cited
        ? allFacts
            .filter((f) => mention.ids.some((id) => (mention.kind === "team" ? f.teams : f.players).has(id)))
            .map((f) => f.id)
        : [];
      const lookUp = mention.kind === "team" ? "the club up with team_story" : "the player up with player_story or find_players";
      report(
        "name-not-in-evidence",
        where,
        elsewhere.length > 0
          ? `${quoted(mention.text)} is not in ${source}. It is in ${list(elsewhere)}: cite that result too, or drop the name from this claim.`
          : `${quoted(mention.text)} is not in any tool result. Look ${lookUp} first, or leave the name out.`,
      );
    }

    // Numbers.
    const sentences = sentencesOf(text);
    const numbers = extractNumbers(text);
    for (const token of numbers) {
      numbersChecked++;
      const sentence = sentences.find((s) => token.start >= s.start && token.start < s.end) ?? { start: 0, end: text.length };
      const here = mentions.filter((m) => m.mention.start >= sentence.start && m.mention.start < sentence.end);
      const players = here.filter((m) => m.mention.kind === "player");
      const context = `in "${excerpt(text, sentence)}"`;

      if (token.kind === "season") {
        const written = `${token.value}-${String(token.other).padStart(2, "0")}`;
        if (written !== options.season) {
          report("season", where, `${quoted(token.text)} is not this season (${options.season.replace("-", "/")}).`);
        }
        continue;
      }

      if (token.kind === "gameweek") {
        // Earlier gameweeks are fair game (their facts are checked like any
        // other); a later one is something no tool could have described.
        if (token.value < 1 || token.value > options.gameweek) {
          report(
            "number-not-in-evidence",
            where,
            `${quoted(token.text)} ${context}: this recap is about gameweek ${options.gameweek}, and the tools know nothing later than that.`,
          );
        }
        continue;
      }

      if (token.kind === "score") {
        // A result from an earlier gameweek (a season list) only counts when
        // the sentence says which gameweek it means.
        const named = new Set(
          extractNumbers(text.slice(sentence.start, sentence.end))
            .filter((t) => t.kind === "gameweek")
            .map((t) => t.value),
        );
        const results = scope
          .flatMap((f) => f.matches)
          .filter((r) => r.gameweek === null || r.gameweek === options.gameweek || named.has(r.gameweek));
        const clubs = new Set(here.filter((m) => m.mention.kind === "team").flatMap((m) => m.ids));
        const people = new Set(players.flatMap((m) => m.ids));
        const has = (id: number | null) => id !== null && clubs.has(id);
        // With both sides named ("Arsenal beat Chelsea 2-1") it must be that
        // match; with one, any of that club's matches this gameweek.
        const between = results.filter((r) => has(r.homeId) && has(r.awayId));
        const ofClubs = between.length > 0 ? between : results.filter((r) => has(r.homeId) || has(r.awayId));
        const ofPeople = results.filter((r) => r.owners?.some((id) => people.has(id)));
        // The score must belong to a club or player the sentence names. A
        // sentence that names neither can use any result in the evidence.
        const anchored = clubs.size > 0 || ofPeople.length > 0;
        const pool = anchored ? [...ofClubs, ...ofPeople] : results;
        const ok =
          pool.some((r) => numbersAgree(token, r.token)) ||
          (!anchored && scope.some((f) => f.numbers.some((n) => numbersAgree(token, n.token))));
        if (!ok) {
          const about = [...clubs].map((id) => teamNames.get(id) ?? "that club");
          const have = [...new Set(pool.map((r) => r.text))];
          report(
            "wrong-score",
            where,
            `The score ${quoted(token.text)} ${context} does not match ${source}` +
              (about.length ? ` for ${list(about)}` : "") +
              (have.length
                ? `. The results there are: ${list(have, 6)}.`
                : ". No result for them is there: call team_story or gameweek_summary first."),
          );
        }
        continue;
      }

      const agreeing = scope.flatMap((f) => f.numbers.filter((n) => numbersAgree(token, n.token)));
      if (agreeing.length === 0) {
        const elsewhere = cited
          ? allFacts.filter((f) => f.numbers.some((n) => numbersAgree(token, n.token))).map((f) => f.id)
          : [];
        const otherKind = scope
          .flatMap((f) => f.numbers)
          .find(
            (n) =>
              n.token.kind !== token.kind &&
              (n.token.kind === "percent" || n.token.kind === "price" || n.token.kind === "plain") &&
              Math.abs(n.token.value - token.value) < 1e-9,
          );
        unsupported.add(`${where}|${token.text}`);
        report(
          cited ? "number-not-cited" : "number-not-in-evidence",
          where,
          `${quoted(token.text)} ${context} is not in ${source}.` +
            (elsewhere.length > 0
              ? ` It is in ${list(elsewhere)}: cite that result, or correct the number.`
              : otherKind
                ? ` The evidence has ${quoted(otherKind.token.text)}: write it the same way.`
                : " Use only numbers a tool returned, exactly as returned: don't add, subtract, average or estimate."),
        );
        continue;
      }

      // What is it a number of, and whose? The words on either side say,
      // up to the neighbouring number or player name.
      const neighbours = [
        ...numbers.filter((n) => n !== token).flatMap((n) => [n.start, n.end]),
        ...players.flatMap((m) => [m.mention.start, m.mention.end]),
      ];
      const from = Math.max(sentence.start, ...neighbours.filter((at) => at <= token.start));
      const to = Math.min(sentence.end, ...neighbours.filter((at) => at >= token.end));
      const written = writtenStat(token, text.slice(from, token.start), text.slice(token.end, to));
      const isStat = (n: Fact) => written.stats === null || written.stats.some((stat) => n.stats.includes(stat));
      const describe = (n: Fact) => statLabel(n.stats[0] ?? n.field);

      // In "Saka (12 points)", the figure has to be Saka's.
      const tight = players.find(
        (m) => m.mention.end <= token.start && /^(?:['’]s)?\s*\([^()]*$/.test(text.slice(m.mention.end, token.start)),
      );
      const subjects = tight ? [tight] : players;
      const about = new Set(subjects.flatMap((m) => m.ids));
      const theirs = (n: Fact) => n.owners !== null && n.owners.some((id) => about.has(id));
      /** Nobody's and no club's: a figure for the gameweek as a whole. */
      const gameweekWide = (n: Fact) => n.owners === null && n.team === null;

      // A sentence that names no player can use any figure of the right stat.
      // One that names a player ties its numbers to that player, unless the
      // words make the number a gameweek-wide one ("the average manager
      // scored", "there were", a chip).
      const tied = subjects.length > 0;
      const rightOwner = (n: Fact) => !tied || theirs(n) || (written.gameweekWide && gameweekWide(n));

      // And when? A season total or another gameweek's figure only counts
      // when the sentence says that is what it means.
      const sentenceText = text.slice(sentence.start, sentence.end);
      const seasonTalk = SEASON_WORDS.test(sentenceText);
      const namedGameweeks = new Set(numbers.filter((n) => n.kind === "gameweek" && n.start >= sentence.start && n.start < sentence.end).map((n) => n.value));
      const rightPeriod = (n: Fact) =>
        n.season
          ? seasonTalk
          : n.gameweek === null || n.gameweek === options.gameweek || namedGameweeks.has(n.gameweek) || seasonTalk;

      if (agreeing.some((n) => isStat(n) && rightOwner(n) && rightPeriod(n))) continue;

      // Rejected. Say what the number is in the evidence, and what the
      // evidence has for the stat the recap named.
      const subject = list([...new Set(subjects.map((m) => m.mention.text))]).replace(/, ([^,]+)$/, " or $1");
      const what = written.label ?? "figure";
      const digits = /^\d/.test(token.text) ? token.text : String(token.value);
      const phrase = quoted(
        written.label && token.kind === "plain" && /^(?:\d|[a-z]+$)/i.test(token.text) && !/^(?:the|a) /.test(written.label) && !/^(?:brace|hat|twice|thrice)/i.test(token.text)
          ? `${token.text} ${written.label}`
          : token.text,
      );
      const when = (n: Fact) =>
        n.season ? " for the season so far" : n.gameweek !== null && n.gameweek !== options.gameweek ? ` in gameweek ${n.gameweek}` : "";
      const whose = (pool: readonly Fact[]) =>
        list([
          ...new Set(
            pool.map((n) =>
              n.owners !== null
                ? `${playerNames.get(n.owners[0]) ?? "another player"}'s ${describe(n)}${when(n)}`
                : n.team !== null
                  ? `${teamNames.get(n.team) ?? "a club"}'s ${describe(n)}${when(n)} (a club figure)`
                  : `${describe(n)}${when(n)} (a gameweek figure)`,
            ),
          ),
        ]);
      /** What the evidence does have for that stat, for the same subject and period. */
      const have = [
        ...new Set(
          scope
            .flatMap((f) => f.numbers.filter((n) => isStat(n) && rightOwner(n) && rightPeriod(n) && !n.stats.includes(PART_POINTS)))
            .map((n) => n.token.text),
        ),
      ];
      const instead =
        written.stats !== null && have.length > 0 && (tied || written.gameweekWide)
          ? ` The evidence has ${list(have, 5)} for ${tied && !written.gameweekWide ? `${subject}'s ` : ""}${what}${seasonTalk ? "" : " this gameweek"}.`
          : "";

      const otherPeriod = agreeing.filter((n) => isStat(n) && rightOwner(n));
      if (otherPeriod.length > 0) {
        // The right stat for the right player, but a season total or another gameweek's.
        report(
          "wrong-period",
          where,
          `${phrase} ${context}: in ${source} ${digits} is ${whose(otherPeriod)}, not this gameweek's.${instead} ` +
            'If you mean the season or an earlier gameweek, say so in the sentence ("this season", "in Gameweek 2").',
        );
        continue;
      }

      const otherStat = agreeing.filter(rightOwner);
      if (written.stats !== null && otherStat.length > 0) {
        // The right player's (or the gameweek's) number, but of something else:
        // "three assists" when 3 is their bonus.
        report(
          "stat-mismatch",
          where,
          `${phrase} ${context}: in ${source} ${digits} is ${whose(otherStat)}, not ${tied && !written.gameweekWide ? `${subject}'s ` : ""}${what}.${instead} ` +
            "Say what the tool returned for that stat.",
        );
        continue;
      }

      // The right stat, but nobody the sentence names: another player's, a
      // club's or the gameweek's.
      const rightStat = agreeing.filter(isStat);
      if (rightStat.length > 0 && rightStat.every((n) => n.owners !== null) && !written.gameweekWide) {
        const owners = [...new Set(rightStat.flatMap((n) => n.owners ?? []))].map((id) => playerNames.get(id) ?? "another player");
        report(
          "wrong-player",
          where,
          `${phrase} ${context}: in ${source} that figure belongs to ${list(owners)}, not ${subject}.${instead} ` +
            "Check which player it describes and correct the sentence.",
        );
        continue;
      }
      report(
        "wrong-subject",
        where,
        `${phrase} ${context}: in ${source} ${digits} is ${whose(rightStat.length > 0 ? rightStat : agreeing)}, not ` +
          (written.gameweekWide ? `a gameweek-wide ${what} or a figure for ${subject}.` : `a figure for ${subject}.`) +
          `${instead} A number in a sentence that names a player must be that player's own. ` +
          "Give gameweek and club figures a sentence of their own.",
      );
    }
  };

  // ---- Headline and paragraphs: against everything -------------------------
  checkText("headline", draft.headline, allFacts, null);
  draft.paragraphs.forEach((paragraph, i) => checkText(`paragraph ${i + 1}`, paragraph, allFacts, null));

  // ---- Claims: against the results they cite -------------------------------
  draft.claims.forEach((claim, i) => {
    const where = `claim ${i + 1}`;
    if (claim.text.length > limits.claimMaxChars) {
      report(
        "length",
        where,
        `This claim is ${claim.text.length} characters. Keep each claim under ${limits.claimMaxChars}: one statement per claim.`,
      );
    }
    if (claim.evidence.length > limits.maxEvidencePerClaim) {
      report(
        "length",
        where,
        `This claim cites ${claim.evidence.length} results. Cite at most ${limits.maxEvidencePerClaim}: split the claim.`,
      );
    }
    const scope: ResultFacts[] = [];
    for (const id of new Set(claim.evidence)) {
      const facts = factsById.get(id);
      if (facts) {
        scope.push(facts);
        continue;
      }
      const entry = options.evidence.find((e) => e.id === id);
      report(
        "unknown-result",
        where,
        !entry
          ? `It cites ${id}, which is not a result id from this session.`
          : entry.tool === "submit_recap"
            ? `It cites ${id}, a submit_recap call. Cite the tool results the facts came from.`
            : `It cites ${id}, a call that failed and returned no data.`,
      );
    }
    checkText(where, claim.text, scope, claim.evidence);
  });

  // ---- Every number in the prose is backed by a claim ----------------------
  if (options.requireClaimCoverage ?? true) {
    const claimed = draft.claims.flatMap((c) => extractNumbers(c.text));
    const parts: [string, string][] = [
      ["headline", draft.headline],
      ...draft.paragraphs.map((p, i): [string, string] => [`paragraph ${i + 1}`, p]),
    ];
    for (const [where, text] of parts) {
      for (const token of extractNumbers(text)) {
        if (token.kind === "gameweek" || token.kind === "season") continue;
        if (unsupported.has(`${where}|${token.text}`)) continue;
        if (claimed.some((c) => numbersAgree(token, c) || numbersAgree(c, token))) continue;
        report(
          "number-without-claim",
          where,
          `${quoted(token.text)} is not backed by a claim. Add a claim that states it and cites the result it came from.`,
        );
      }
    }
  }

  return { passed: issues.length === 0, issues, numbersChecked, namesChecked };
}
