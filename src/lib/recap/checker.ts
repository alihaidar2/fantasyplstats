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
// A card recap (version 2, cards.ts) is checked the same way: each card is
// read as one sentence per figure, naming the player or club it belongs to
// ("Alysson scored 16 points.", "Alysson was owned by 0.1%."), checked
// against the results the card cites. Its free text (a title, a line) is
// checked as written. A player's ref must be that player. The headline is
// checked against everything, and its numbers must be on a card.
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
  countsPlayers,
  writtenStat,
} from "./stats";
import { cardFreeText, cardPlayerRefs, cardStatements, wordCount, type RecapCard } from "./cards";
import {
  PARAGRAPH_RECAP_LIMITS,
  RECAP_LIMITS,
  type CheckIssue,
  type CheckReport,
  type EvidenceEntry,
  type ParagraphDraft,
  type ParagraphRecapLimits,
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
  limits?: Partial<RecapLimits & ParagraphRecapLimits>;
  /** Real names that must never appear, e.g. the members of a mini-league. Matched ignoring case. */
  forbiddenNames?: readonly string[];
  /** Numbers in the headline and paragraphs (or the headline of a card recap) must also appear in a claim (or a card). Default true. */
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
        // A bare "City" in a tool's note says nothing about which club it is.
        if (mention.sharedNickname) continue;
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

/** "eight-goal thriller", "8-goal game": the number is the goals in a match, not a player's. */
const MATCH_GOALS_AFTER = /^-goal\s+(?:thriller|game|match|draw|contest|classic|win|victory|defeat)(?![\p{L}])/iu;

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

/** A bound read from the words around a number: which figures meet it, and the words that made it one. */
interface Threshold {
  meets(figure: number, bound: number): boolean;
  /** The text after the number with the threshold words removed, so the stat word can be read. */
  rest: string;
  /** Where the whole phrase starts and ends, given the number's own start and end. */
  start(tokenStart: number): number;
  end(tokenEnd: number): number;
}

const THRESHOLD_AFTER: [RegExp, Threshold["meets"]][] = [
  [/^(?:\s+or\s+(?:more|better|higher|above|over)|\+|-plus|\s+plus)(?![\p{L}\p{N}])/iu, (figure, bound) => figure >= bound],
  [/^\s+or\s+(?:fewer|less|lower|under|below)(?![\p{L}])/iu, (figure, bound) => figure <= bound],
];
const THRESHOLD_BEFORE: [RegExp, Threshold["meets"]][] = [
  [/\b(?:at least|no fewer than|no less than|a minimum of|upwards of)\s+$/i, (figure, bound) => figure >= bound],
  [/\b(?:more than|over|above|in excess of|north of|past)\s+$/i, (figure, bound) => figure > bound],
  [/\b(?:at most|no more than|a maximum of|up to)\s+$/i, (figure, bound) => figure <= bound],
  [/\b(?:fewer than|less than|under|below|short of)\s+$/i, (figure, bound) => figure < bound],
];

/** Reads "10 or more", "10+", "at least 10", "more than 10", "under 10" around a number. Null when it is a plain figure. */
function thresholdOf(before: string, after: string): Threshold | null {
  for (const [pattern, meets] of THRESHOLD_AFTER) {
    const match = pattern.exec(after);
    if (match) {
      return { meets, rest: after.slice(match[0].length), start: (at) => at, end: (at) => at + match[0].length };
    }
  }
  for (const [pattern, meets] of THRESHOLD_BEFORE) {
    const match = pattern.exec(before);
    if (match) return { meets, rest: after, start: (at) => at - match[0].length, end: (at) => at };
  }
  return null;
}

const quoted = (text: string) => `"${text.trim()}"`;

function excerpt(text: string, sentence: Sentence): string {
  const s = text.slice(sentence.start, sentence.end).trim();
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

const list = (items: readonly string[], max = 4) =>
  items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");

/** What a text checker shares between the pieces of one recap. */
interface TextChecker {
  report(code: string, where: string, message: string): void;
  /**
   * Checks one piece of text: its names and numbers against `scope` (the
   * results it may draw on), and its content (betting, links, quotes).
   * `cited` is the ids the piece cites, or null when it may use anything.
   */
  checkText(where: string, text: string, scope: readonly ResultFacts[], cited: readonly string[] | null): void;
  /** Numbers already reported as absent from the evidence, as "where|text". */
  unsupported: Set<string>;
  allFacts: readonly ResultFacts[];
  factsById: ReadonlyMap<string, ResultFacts>;
  /** The results a piece cites, reporting ids that are unknown, failed or a submit_recap call. */
  scopeOf(where: string, ids: readonly string[]): ResultFacts[];
  finish(): CheckReport;
}

/** The checker for one recap. `recapText` is all of its text, to settle which club a shared nickname means. */
function textChecker(options: CheckOptions, recapText: string, citer = "claim"): TextChecker {
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

  // Clubs the recap names in full, to settle which club a shared nickname ("City", "United") means.
  const fullTeamsIn = (text: string) =>
    new Set(names.scan(text).mentions.filter((m) => m.kind === "team" && !m.sharedNickname).flatMap((m) => m.ids));
  const fullTeamsInRecap = fullTeamsIn(recapText);

  const usable = options.evidence.filter((e) => e.ok && e.tool !== "submit_recap");
  const allFacts = usable.map((e) => readResult(e, names));
  const factsById = new Map(allFacts.map((f) => [f.id, f]));

  // ---- One piece of text against the results it may draw on ----------------
  const checkText = (where: string, text: string, scope: readonly ResultFacts[], cited: readonly string[] | null) => {
    const source = cited ? `the results this ${citer} cites (${cited.join(", ") || "none"})` : "any tool result";

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
    const fullTeamsHere = fullTeamsIn(text);
    for (const found of scan.mentions) {
      let mention = found;
      if (mention.sharedNickname) {
        // "City" could be Man City, Hull City or Coventry City. It is taken
        // as the one the writing has named in full: in this text, failing
        // that anywhere in the recap. With none named, or two, it is refused.
        const candidates = mention.ids;
        const here = candidates.filter((id) => fullTeamsHere.has(id));
        const anywhere = candidates.filter((id) => fullTeamsInRecap.has(id));
        const meant = here.length > 0 ? here : anywhere;
        if (meant.length !== 1) {
          namesChecked++;
          const clubs = (meant.length > 1 ? meant : candidates).map((id) => teamNames.get(id) ?? "another club");
          report(
            "ambiguous-name",
            where,
            `${quoted(mention.text)} could mean ${list(clubs, 6).replace(/, ([^,]+)$/, " or $1")}. ` +
              "Write the club's name as the tools give it.",
          );
          continue;
        }
        mention = { ...mention, ids: meant, exactIds: meant };
      }
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

      // What is it a number of, and whose? The words on either side say,
      // up to the neighbouring number or player name.
      const neighbours = [
        ...numbers.filter((n) => n !== token).flatMap((n) => [n.start, n.end]),
        ...players.flatMap((m) => [m.mention.start, m.mention.end]),
      ];
      const from = Math.max(sentence.start, ...neighbours.filter((at) => at <= token.start));
      const to = Math.min(sentence.end, ...neighbours.filter((at) => at >= token.end));
      const beforeText = text.slice(from, token.start);
      const bound = thresholdOf(beforeText, text.slice(token.end, to));
      const written = writtenStat(token, beforeText, bound ? bound.rest : text.slice(token.end, to));
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
      // Two more figures are not a named player's, by the way they are written:
      // - A club's own figure straight after the club: "Brighton made it 4
      //   wins in a row, with Kostoulas (12 points) ...". The club must come
      //   before the number with no player named in between, the words must
      //   name the stat, and the figure must be that club's in the evidence.
      // - A match's goals as an adjective: "in the eight-goal thriller". It
      //   needs an article before it (so "Brobbey's three-goal game" is still
      //   Brobbey's goals), and a figure for goals that is no player's.
      const clubsBefore = new Set(
        tight || written.stats === null
          ? []
          : here
              .filter(
                (m) =>
                  m.mention.kind === "team" &&
                  m.mention.end <= token.start &&
                  !players.some((p) => p.mention.start >= m.mention.end && p.mention.start < token.start),
              )
              .flatMap((m) => m.ids),
      );
      const theirClubs = (n: Fact) => n.owners === null && n.team !== null && clubsBefore.has(n.team);
      const matchGoals =
        !tight &&
        token.kind === "plain" &&
        /\b(?:the|an?|that|this)\s+$/i.test(text.slice(sentence.start, token.start)) &&
        MATCH_GOALS_AFTER.test(text.slice(token.end, sentence.end));
      const rightOwner = (n: Fact) =>
        !tied ||
        theirs(n) ||
        (written.gameweekWide && gameweekWide(n)) ||
        theirClubs(n) ||
        (matchGoals && gameweekWide(n) && n.stats.includes("goals"));

      // And when? A season total or another gameweek's figure only counts
      // when the sentence says that is what it means.
      const sentenceText = text.slice(sentence.start, sentence.end);
      const seasonTalk = SEASON_WORDS.test(sentenceText);
      const namedGameweeks = new Set(numbers.filter((n) => n.kind === "gameweek" && n.start >= sentence.start && n.start < sentence.end).map((n) => n.value));
      const rightPeriod = (n: Fact) =>
        n.season
          ? seasonTalk
          : n.gameweek === null || n.gameweek === options.gameweek || namedGameweeks.has(n.gameweek) || seasonTalk;

      // A threshold ("10 or more points", "at least 3 goals", "over 20%") is
      // a bound, not a figure: no tool returns the 10. It stands when the
      // evidence in scope has a figure of that stat, for the player the
      // sentence names if it names one, that meets the bound. It needs a
      // stat word: a bare "10 or more" could be met by any number at all.
      if (bound && written.stats !== null) {
        const met = scope.some((f) =>
          f.numbers.some(
            (n) =>
              n.token.kind === token.kind &&
              bound.meets(n.token.value, token.value) &&
              isStat(n) &&
              !n.stats.includes(PART_POINTS) &&
              rightOwner(n) &&
              rightPeriod(n),
          ),
        );
        if (met) continue;
        unsupported.add(`${where}|${token.text}`);
        const whoseStat = tied && !written.gameweekWide ? `${list([...new Set(subjects.map((m) => m.mention.text))])}'s ` : "";
        report(
          "threshold-not-supported",
          where,
          `${quoted(text.slice(bound.start(token.start), bound.end(token.end)).trim())} ${context}: ${source} ${cited ? "have" : "has"} no ` +
            `${whoseStat}${written.label ?? "figure"} figure that meets it${seasonTalk ? "" : " this gameweek"}. ` +
            "State the exact figure a tool returned instead.",
        );
        continue;
      }

      // "Szoboszlai, Isak and Gakpo ... all three": a count of the players
      // the sentence itself names. It has to match the names exactly.
      if (
        token.kind === "plain" &&
        !/\d/.test(token.text) &&
        /\b(?:all|the|those|these)\s+$/i.test(beforeText) &&
        new Set(players.map((m) => m.ids.join(","))).size === token.value
      ) {
        continue;
      }

      // "Seven players scored 10 or more points": no tool returns the 7, but
      // a ranked list can prove it. It stands when one result in scope lists
      // exactly that many players meeting the bound and at least one player
      // who falls short of it, so the list reaches past the threshold.
      if (token.kind === "plain" && token.unit === 1 && countsPlayers(text.slice(token.end, to))) {
        const next = numbers.find((n) => n.start >= token.end && n.start < sentence.end && n.kind === "plain");
        if (next) {
          const nextNeighbours = numbers.filter((n) => n !== next).flatMap((n) => [n.start, n.end]);
          const nextFrom = Math.max(sentence.start, ...nextNeighbours.filter((at) => at <= next.start));
          const nextTo = Math.min(sentence.end, ...nextNeighbours.filter((at) => at >= next.end));
          const nextBound = thresholdOf(text.slice(nextFrom, next.start), text.slice(next.end, nextTo));
          const nextStat = nextBound ? writtenStat(next, text.slice(nextFrom, next.start), nextBound.rest) : null;
          if (nextBound && nextStat?.stats) {
            const proven = scope.some((f) => {
              const meeting = new Set<number>();
              const short = new Set<number>();
              for (const n of f.numbers) {
                if (n.owners === null || n.owners.length !== 1 || n.token.kind !== "plain") continue;
                if (n.season || (n.gameweek !== null && n.gameweek !== options.gameweek)) continue;
                if (!nextStat.stats!.some((stat) => n.stats.includes(stat)) || n.stats.includes(PART_POINTS)) continue;
                // Only a player's headline figure counts (a row's own points), not a doubled captain score.
                if (n.field !== nextStat.stats![0]) continue;
                (nextBound.meets(n.token.value, next.value) ? meeting : short).add(n.owners[0]);
              }
              for (const id of meeting) short.delete(id);
              return meeting.size === token.value && short.size > 0;
            });
            if (proven) continue;
          }
        }
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

  const scopeOf = (where: string, ids: readonly string[]): ResultFacts[] => {
    const scope: ResultFacts[] = [];
    for (const id of new Set(ids)) {
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
    return scope;
  };

  return {
    report,
    checkText,
    unsupported,
    allFacts,
    factsById,
    scopeOf,
    finish: () => ({ passed: issues.length === 0, issues, numbersChecked, namesChecked }),
  };
}

/** Checks a version 1 recap: a headline, paragraphs and the claims behind them. */
export function checkParagraphRecap(draft: ParagraphDraft, options: CheckOptions): CheckReport {
  const limits: ParagraphRecapLimits = { ...PARAGRAPH_RECAP_LIMITS, ...options.limits };
  const checker = textChecker(options, [draft.headline, ...draft.paragraphs].join("\n"));
  const { report, checkText, unsupported, allFacts } = checker;

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
    const scope = checker.scopeOf(where, claim.evidence);
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

  return checker.finish();
}


const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How many items of a card's list it may have, and what they are called in messages. */
function listBounds(card: RecapCard, limits: RecapLimits): { count: number; min: number; max: number; noun: string } | null {
  switch (card.type) {
    case "numbers":
      return { count: card.items.length, min: limits.numbersMin, max: limits.numbersMax, noun: "figure" };
    case "players":
      return { count: card.players.length, min: limits.playersMin, max: limits.playersMax, noun: "player" };
    case "matches":
      return { count: card.matches.length, min: limits.matchesMin, max: limits.matchesMax, noun: "match" };
    case "transfers":
      return { count: card.moves.length, min: limits.movesMin, max: limits.movesMax, noun: "move" };
    case "notes":
      return { count: card.items.length, min: limits.notesMin, max: limits.notesMax, noun: "note" };
    case "captaincy":
      return null;
  }
}

/**
 * Checks a recap of story cards (version 2): the headline against every tool
 * result, and each card against the results it cites, one figure at a time.
 */
export function checkRecap(draft: RecapDraft, options: CheckOptions): CheckReport {
  const limits: RecapLimits = { ...RECAP_LIMITS, ...options.limits };
  const startsWithName = (text: string) => options.names.scan(text).mentions.some((m) => m.start === 0 && !m.weak);
  const statements = draft.cards.map((card, i) => cardStatements(card, `card ${i + 1} (${card.type})`, startsWithName));
  const checker = textChecker(
    options,
    [draft.headline, ...statements.flat().map((s) => s.text)].join("\n"),
    "card",
  );
  const { report, checkText, unsupported, allFacts } = checker;

  const playerNames = new Map<number, string>();
  for (const entry of options.nameEntries) if (entry.kind === "player") playerNames.set(entry.id, entry.webName);

  // ---- The headline and the number of cards ---------------------------------
  const headline = draft.headline.trim();
  if (headline.length < limits.headlineMinChars || headline.length > limits.headlineMaxChars) {
    report(
      "length",
      "headline",
      `The headline is ${headline.length} characters. Keep it between ${limits.headlineMinChars} and ${limits.headlineMaxChars}.`,
    );
  }
  if (draft.cards.length < limits.minCards || draft.cards.length > limits.maxCards) {
    report("length", "recap", `The recap has ${plural(draft.cards.length, "card")}. Give between ${limits.minCards} and ${limits.maxCards}.`);
  }
  for (const type of ["numbers", "captaincy"] as const) {
    const count = draft.cards.filter((c) => c.type === type).length;
    if (count > 1) report("card-type", "recap", `There are ${count} ${type} cards. Give at most one: merge them.`);
  }

  // ---- Each card against the results it cites --------------------------------
  draft.cards.forEach((card, i) => {
    const where = `card ${i + 1} (${card.type})`;

    if (card.evidence.length > limits.maxEvidencePerCard) {
      report(
        "length",
        where,
        `This card cites ${card.evidence.length} results. Cite at most ${limits.maxEvidencePerCard}: split the card, or drop what isn't needed.`,
      );
    }
    const bounds = listBounds(card, limits);
    if (bounds && (bounds.count < bounds.min || bounds.count > bounds.max)) {
      report(
        "length",
        where,
        `This card has ${plural(bounds.count, bounds.noun, bounds.noun === "match" ? "matches" : undefined)}. Give between ${bounds.min} and ${bounds.max}.`,
      );
    }
    if (card.type === "captaincy" && (card.tiles?.length ?? 0) > limits.tilesMax) {
      report("length", where, `This card has ${card.tiles!.length} tiles. Give at most ${limits.tilesMax}.`);
    }
    for (const piece of cardFreeText(card, limits)) {
      const words = wordCount(piece.text);
      if (piece.text.trim().length === 0) report("length", `${where}, ${piece.at}`, "This is empty: leave it out instead.");
      else if (words > piece.maxWords) {
        report("length", `${where}, ${piece.at}`, `This is ${words} words. Keep it to ${piece.maxWords} words at most.`);
      }
    }
    if (card.type === "transfers") {
      card.moves.forEach((m, j) => {
        if (m.run && (m.run.gameweeks < limits.runMinGameweeks || m.run.gameweeks > limits.runMaxGameweeks)) {
          report(
            "length",
            `${where}, move ${j + 1} run`,
            `A run of ${m.run.gameweeks} gameweeks is not a run: give one of ${limits.runMinGameweeks} or more, or leave it out.`,
          );
        }
      });
    }
    if (card.type === "notes") {
      card.items.forEach((n, j) => {
        if (n.points !== undefined && !n.player) {
          report("card-field", `${where}, note ${j + 1}`, "Points need the player they belong to: give the player and ref too.");
        }
      });
    }

    // Each ref is the player named with it.
    for (const named of cardPlayerRefs(card, where)) {
      if (!named.ref) {
        report("player-ref", named.where, `Give ${quoted(named.player)}'s ref (such as "p411") from the tool results.`);
        continue;
      }
      const id = Number(named.ref.slice(1));
      if (options.names.lookupPlayer(named.player).includes(id)) continue;
      const actual = playerNames.get(id);
      report(
        "player-ref",
        named.where,
        actual
          ? `The ref ${named.ref} is ${actual}, not ${quoted(named.player)}. Give the name and ref a tool returned together.`
          : `The ref ${named.ref} is not a player in the data. Give the ref a tool returned with ${quoted(named.player)}.`,
      );
    }

    const scope = checker.scopeOf(where, card.evidence);
    for (const statement of statements[i]) checkText(statement.where, statement.text, scope, card.evidence);
  });

  // ---- The headline: against everything, and its numbers on a card ------------
  checkText("headline", draft.headline, allFacts, null);
  if (options.requireClaimCoverage ?? true) {
    const onCards = statements.flat().flatMap((s) => extractNumbers(s.text));
    for (const token of extractNumbers(draft.headline)) {
      if (token.kind === "gameweek" || token.kind === "season") continue;
      if (unsupported.has(`headline|${token.text}`)) continue;
      if (onCards.some((c) => numbersAgree(token, c) || numbersAgree(c, token))) continue;
      report(
        "number-without-card",
        "headline",
        `${quoted(token.text)} is in the headline but on no card. Put it on the card it belongs to, citing the result it came from, or leave it out of the headline.`,
      );
    }
  }

  return checker.finish();
}
