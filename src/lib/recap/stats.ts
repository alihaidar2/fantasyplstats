// Which stat a number is. The checker uses this on both sides: a number in a
// tool result is tagged from the field it sits in ("assists": 2), and a number
// in the recap from the words around it ("two assists", "a brace", "an xG of
// 0.82"). "Three assists" then has to find a 3 that is an assists figure, not
// just any 3.

import type { NumberToken } from "./numbers";

/** Tool-result field name -> the stats a number there counts as. Fields not listed are untyped. */
const FIELD_STATS: Record<string, readonly string[]> = {
  points: ["points"],
  seasonPoints: ["points"],
  earnedPoints: ["points"],
  bestScore: ["points"],
  captainPoints: ["points"],
  tripleCaptainPoints: ["points"],
  clubTotal: ["points"],
  averageScore: ["averageScore", "points"],
  highestScore: ["highestScore", "points"],
  goals: ["goals"],
  goalsFor: ["goals"],
  goalsAgainst: ["goals"],
  margin: ["goals"],
  ownGoals: ["ownGoals", "goals"],
  assists: ["assists"],
  bonus: ["bonus"],
  bps: ["bps"],
  minutes: ["minutes"],
  cleanSheets: ["cleanSheets"],
  saves: ["saves"],
  penaltiesSaved: ["penaltiesSaved"],
  penaltiesMissed: ["penaltiesMissed"],
  defensiveContribution: ["defensiveContribution"],
  clearancesBlocksInterceptions: ["clearancesBlocksInterceptions"],
  tackles: ["tackles"],
  recoveries: ["recoveries"],
  xG: ["xG"],
  xA: ["xA"],
  xGI: ["xGI"],
  ownership: ["ownership"],
  ownershipBefore: ["ownership"],
  ownershipThen: ["ownership"],
  ownershipNow: ["ownership"],
  shareOfManagers: ["chips", "ownership"],
  chanceOfPlayingNextRound: ["chance"],
  ownedBy: ["owners", "managers"],
  ranked: ["managers"],
  netTransfersIn: ["transfers", "managers"],
  netTransfersOut: ["transfers", "managers"],
  netTransfersInOverTheseGameweeks: ["transfers", "managers"],
  netTransfersOutOverTheseGameweeks: ["transfers", "managers"],
  transfersMade: ["transfers"],
  price: ["price"],
  priceChange: ["price"],
  priceChangeSinceLastGameweek: ["price"],
  priceChangeSinceFirstGameweek: ["price"],
  yellowCards: ["yellowCards"],
  redCards: ["redCards"],
  matches: ["matches"],
  matchCount: ["matches"],
  gameweeksPlayed: ["matches"],
  won: ["won"],
  drawn: ["drawn"],
  lost: ["lost"],
};

/** The `stat` of a points-breakdown line ({ stat, value, points }) -> what its `value` counts. */
const BREAKDOWN_STATS: Record<string, readonly string[]> = {
  minutes: ["minutes"],
  goals_scored: ["goals"],
  assists: ["assists"],
  clean_sheets: ["cleanSheets"],
  goals_conceded: ["goals"],
  own_goals: ["ownGoals", "goals"],
  penalties_saved: ["penaltiesSaved"],
  penalties_missed: ["penaltiesMissed"],
  yellow_cards: ["yellowCards"],
  red_cards: ["redCards"],
  saves: ["saves"],
  bonus: ["bonus"],
  defensive_contribution: ["defensiveContribution"],
};

/** Points from one line of a breakdown ("12 points for his two goals"): points, but not a player's score. */
export const PART_POINTS = "partPoints";

/**
 * Fields whose contents are season-to-date figures rather than this
 * gameweek's: `season`, `seasonPoints`, `seasonLeaders`, `sinceFirstGameweek`.
 */
export const isSeasonField = (field: string) => /^season/i.test(field) || /SinceFirst/i.test(field);

/** Words that say a sentence is talking about the season, not just this gameweek. */
export const SEASON_WORDS =
  /\b(?:seasons?|so far|campaign|this term|to date|overall|in total|all told|since|now (?:has|have|on|up to)|tally|tall(?:y|ies)|totals?|running total)\b/i;

/** Fields that say which gameweek a row is about: a gameweek reference, not a count. */
export const isGameweekField = (field: string) => field === "gameweek" || field.endsWith("Gameweek");

/** The stats a number in a tool result counts as, from its field and the object it is in. */
export function statsOfField(field: string, parent: Record<string, unknown>): readonly string[] {
  if (typeof parent.stat === "string") {
    // A points-breakdown line: { stat: "goals_scored", value: 2, points: 12 }.
    if (field === "value") return BREAKDOWN_STATS[parent.stat] ?? [];
    if (field === "points") return ["points", PART_POINTS];
  }
  // { chip, played } counts managers; a league table's `played` counts matches.
  if (field === "played") return typeof parent.chip === "string" ? ["chips", "managers"] : ["matches"];
  if (field.includes("InARow")) return ["streak"];
  return FIELD_STATS[field] ?? [];
}

const STAT_LABELS: Record<string, string> = {
  points: "points",
  averageScore: "the average manager score",
  highestScore: "the highest manager score",
  goals: "goals",
  ownGoals: "own goals",
  assists: "assists",
  bonus: "bonus points",
  bps: "BPS",
  minutes: "minutes",
  cleanSheets: "clean sheets",
  saves: "saves",
  penaltiesSaved: "penalties saved",
  penaltiesMissed: "penalties missed",
  defensiveContribution: "defensive contributions",
  clearancesBlocksInterceptions: "clearances, blocks and interceptions",
  tackles: "tackles",
  recoveries: "recoveries",
  xG: "xG",
  xA: "xA",
  xGI: "xGI",
  ownership: "ownership",
  chance: "a chance of playing",
  owners: "managers who own the player",
  managers: "managers",
  transfers: "net transfers",
  chips: "chip plays",
  price: "a price",
  yellowCards: "yellow cards",
  redCards: "red cards",
  matches: "matches",
  won: "wins",
  drawn: "draws",
  lost: "defeats",
  streak: "a run of gameweeks",
};

/** "clubTotal" -> "club total" */
const words = (field: string) => field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** How to name a stat, or an untyped field, in a message. */
export const statLabel = (stat: string) => STAT_LABELS[stat] ?? words(stat);

/** What the words around a number in the recap say it is. */
export interface WrittenStat {
  /**
   * The stats it may be (any one will do), or null when the words don't say:
   * such a number can be any figure.
   */
  stats: readonly string[] | null;
  /** How the recap put it, for messages: "assists". */
  label: string | null;
  /**
   * The words make it a figure for the whole gameweek ("the average manager
   * scored", "there were four red cards", "14 players", a chip) rather than
   * for a player named in the sentence.
   */
  gameweekWide: boolean;
}

/** Stat words that can follow a number, most specific first. */
const NOUNS: [RegExp, string][] = [
  [/^bonus(?:\s+(?:points?|pts))?(?![\p{L}])/iu, "bonus"],
  [/^(?:bps|bonus points? system)(?![\p{L}])/iu, "bps"],
  [/^defensive contributions?(?![\p{L}])/iu, "defensiveContribution"],
  [/^clean sheets?(?![\p{L}])/iu, "cleanSheets"],
  [/^(?:red cards?|reds|sendings? off|dismissals?)(?![\p{L}])/iu, "redCards"],
  [/^(?:yellow cards?|yellows|bookings?|cautions?)(?![\p{L}])/iu, "yellowCards"],
  [/^own goals?(?![\p{L}])/iu, "ownGoals"],
  [/^(?:xgi|expected goal involvements?)(?![\p{L}])/iu, "xGI"],
  [/^(?:xg|expected goals?)(?![\p{L}])/iu, "xG"],
  [/^(?:xa|expected assists?)(?![\p{L}])/iu, "xA"],
  [/^goals?(?![\p{L}])/iu, "goals"],
  [/^assists?(?![\p{L}])/iu, "assists"],
  [/^(?:points?|pts|pointers?)(?![\p{L}])/iu, "points"],
  [/^(?:minutes?|mins)(?![\p{L}])/iu, "minutes"],
  [/^saves?(?![\p{L}])/iu, "saves"],
  [/^tackles?(?![\p{L}])/iu, "tackles"],
  [/^recover(?:y|ies)(?![\p{L}])/iu, "recoveries"],
  [/^(?:managers|owners|squads|fpl teams)(?![\p{L}])/iu, "managers"],
  [/^(?:net\s+)?transfers?(?![\p{L}])/iu, "transfers"],
  [/^(?:(?:game)?weeks?|games?|matches|fixtures|appearances) (?:in a row|running|in succession|on the bounce|on the spin)(?![\p{L}])/iu, "streak"],
  [/^(?:consecutive|straight|successive)(?![\p{L}])/iu, "streak"],
  [/^(?:matches|games|fixtures)(?![\p{L}])/iu, "matches"],
  [/^(?:wins|victories)(?![\p{L}])/iu, "won"],
  [/^draws(?![\p{L}])/iu, "drawn"],
  [/^(?:defeats|losses)(?![\p{L}])/iu, "lost"],
];

/** Words that can sit between a number and its stat word: "17 FPL points", "two more goals". */
const MODIFIER = /^(?:more|further|fpl|fantasy|league|total|extra|additional|valuable|precious|whole|full|big|huge|net|fewer|late|early)\s+/i;

/** "14 players", "three clubs": a count across the gameweek, never one player's stat. */
const COUNTED = /^(?:players|defenders|midfielders|forwards|strikers|goalkeepers|keepers|clubs|teams|sides)(?![\p{L}])/iu;

/** "seven players": the number counts players in general (not defenders or clubs, which a list can't prove). */
export const countsPlayers = (after: string) => /^\s+(?:(?:different|other|more)\s+)?players(?![\p{L}])/iu.test(after);

const CHIP = /\b(?:triple captain(?:s|ed|cy)?|bench boosts?|free hits?|wildcards?|chips?)\b/i;

/** A stat named just before the number: "an xG of 0.82", "owned by 7.3 million". */
const BEFORE: [RegExp, string][] = [
  [/(?:\bxgi|expected goal involvements?)(?:\s+(?:of|was|at|to))?\s*[:(]?\s*$/i, "xGI"],
  [/(?:\bxg|expected goals?)(?:\s+(?:of|was|at|to))?\s*[:(]?\s*$/i, "xG"],
  [/(?:\bxa|expected assists?)(?:\s+(?:of|was|at|to))?\s*[:(]?\s*$/i, "xA"],
  [/\bbps(?:\s+(?:of|score of|tally of|was))?\s*[:(]?\s*$/i, "bps"],
  [/\b(?:owned by|selected by|picked by)\s+(?:(?:just|only|around|about|nearly|almost|over|more than|under|fewer than|some)\s+)?$/i, "owners"],
];

/**
 * Reads the stat of a number in the recap. `before` and `after` are the text
 * on either side of it, up to the neighbouring number or player name, so a
 * stat word is never borrowed from the next figure along.
 */
export function writtenStat(token: NumberToken, before: string, after: string): WrittenStat {
  const word = token.text.toLowerCase();
  let stat: string | null = null;

  if (token.kind === "price") stat = "price";
  else if (token.kind === "percent") stat = /\bchance\b/i.test(before.slice(-40)) || /^.{0,20}\bchance\b/i.test(after) ? "chance" : "ownership";
  else if (/^brace/.test(word) || /^hat/.test(word)) stat = "goals";
  else if (word === "twice" || word === "thrice") {
    // "scored twice" is two goals; "assisted twice" two assists.
    if (/\b(?:scor\w+|net(?:ted|ting|s)?|struck|strik\w+|found the net)\s+$/i.test(before)) stat = "goals";
    else if (/\b(?:assist\w*|set up|teed up)\s+$/i.test(before)) stat = "assists";
  }

  let counted = false;
  if (stat === null) {
    // "his 4th goal": skip the ordinal ending.
    let rest = after.replace(/^(?:st|nd|rd|th)(?![\p{L}])/iu, "").replace(/^[\s-]+/, "");
    for (let i = 0; i < 3 && stat === null; i++) {
      if (COUNTED.test(rest)) {
        counted = true;
        break;
      }
      const noun = NOUNS.find(([pattern]) => pattern.test(rest));
      if (noun) stat = noun[1];
      else if (MODIFIER.test(rest)) rest = rest.replace(MODIFIER, "");
      else break;
    }
  }
  if (stat === null && !counted) stat = BEFORE.find(([pattern]) => pattern.test(before))?.[1] ?? null;

  // Words that make it a gameweek-wide figure, whoever else the sentence names.
  if (/\baverag/i.test(before) || /^[\s-]*(?:(?:points?|pts)[\s-]+)?(?:on\s+)?average\b/i.test(after)) {
    return { stats: ["averageScore"], label: "the average manager score", gameweekWide: true };
  }
  if (/\b(?:highest|top|best)\b[^.;]*\bmanagers?\b|\bmanagers?\b[^.;]*\b(?:highest|top|best)\b/i.test(before)) {
    return { stats: ["highestScore"], label: "the highest manager score", gameweekWide: true };
  }
  // A chip nearby makes a count the chip's ("1.79 million played Triple Captain", "17.2% of managers"), but
  // not a figure the words have given a stat of its own ("a Triple Captain on him returned 27 points"), and
  // not a small number, which is a score ("18 for a captain and 27 for a Triple Captain"): no chip is played
  // by fewer than a thousand managers. A percentage may also be the ownership of a player the sentence names.
  const ownStat = stat !== null && stat !== "managers" && token.kind !== "percent";
  const chipSized = token.kind === "percent" || (token.kind === "plain" && token.value >= 1000);
  if (!ownStat && chipSized && (CHIP.test(before) || CHIP.test(after.slice(0, 60)))) {
    return {
      stats: token.kind === "percent" ? ["chips", "ownership"] : ["chips"],
      label: "chip plays",
      gameweekWide: true,
    };
  }
  const existential = /\bthere (?:were|was|have been|has been)\b/i.test(before);
  return {
    stats: stat === null ? null : [stat],
    label: stat === null ? null : statLabel(stat),
    gameweekWide: counted || existential,
  };
}
