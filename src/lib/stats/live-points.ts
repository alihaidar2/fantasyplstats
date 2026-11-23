// "How FPL points work" (/points/), worked out from the points FPL actually
// awarded rather than from a hard-coded rule book:
//
// 1. The live gameweek's points breakdown (`explain`) says, per player and
//    match, how many points each action earned ("goals_scored", value 1, 5
//    points). FPL leaves out lines worth 0 points (1 goal conceded, a
//    defensive contribution under the threshold, a forward's clean sheet), so
//    for a player with one match, a stat in their live totals with no line in
//    the breakdown earned 0 points.
// 2. Settled gameweeks earlier in the season add evidence: each player's
//    history row has their minutes, goals, assists, bonus, defensive
//    contribution and total points per match, and the match stats add cards,
//    saves, own goals and penalties. When every part of a row's score but one
//    is known, the rest of the total is what that one part was worth.
//
// Each rule has a shape (points per unit, points per N, or thresholds) and the
// numbers in it come from the data. A rule the data doesn't pin down is
// reported as unseen, ambiguous or a range, never filled in from FPL's
// published rules. No Next.js, React or `@/` imports.

import { isSettled, matchStatRows, type Fixture, type LiveExplain, type Snapshot } from "../fpl";

export const POSITION_IDS = [1, 2, 3, 4] as const;
export type PositionId = (typeof POSITION_IDS)[number];

/**
 * - per: the same points for each unit (a goal, a card); 0 means no points.
 * - every: points for every N (saves, goals conceded).
 * - step: points once a value reaches a threshold (minutes, defensive contribution).
 */
export type RuleShape = "per" | "every" | "step";

export interface PointAction {
  id: string;
  label: string;
  shape: RuleShape;
  /** The unit in words, for a value of `n`: "3 saves". */
  unit: (n: number) => string;
}

const plural = (one: string, many = `${one}s`) => (n: number) => `${n} ${n === 1 ? one : many}`;

/** Every action FPL's breakdown has listed in 2026/27, in the order the page shows them. */
export const POINT_ACTIONS: readonly PointAction[] = [
  { id: "minutes", label: "Minutes played", shape: "step", unit: plural("minute") },
  { id: "goals_scored", label: "Goal scored", shape: "per", unit: plural("goal") },
  { id: "assists", label: "Assist", shape: "per", unit: plural("assist") },
  { id: "clean_sheets", label: "Clean sheet", shape: "per", unit: plural("clean sheet") },
  { id: "goals_conceded", label: "Goals conceded", shape: "every", unit: plural("goal conceded", "goals conceded") },
  { id: "saves", label: "Saves", shape: "every", unit: plural("save") },
  { id: "penalties_saved", label: "Penalty saved", shape: "per", unit: plural("penalty saved", "penalties saved") },
  { id: "penalties_missed", label: "Penalty missed", shape: "per", unit: plural("penalty missed", "penalties missed") },
  {
    id: "defensive_contribution",
    label: "Defensive contribution",
    shape: "step",
    unit: (n) => `${n} defensive contribution${n === 1 ? "" : "s"}`,
  },
  { id: "bonus", label: "Bonus", shape: "per", unit: plural("bonus point") },
  { id: "yellow_cards", label: "Yellow card", shape: "per", unit: plural("yellow card") },
  { id: "red_cards", label: "Red card", shape: "per", unit: plural("red card") },
  { id: "own_goals", label: "Own goal", shape: "per", unit: plural("own goal") },
];

const ACTION_BY_ID = new Map(POINT_ACTIONS.map((a) => [a.id, a]));

/** The action for an identifier; one FPL adds later is treated as points per unit. */
export function pointAction(id: string): PointAction {
  return (
    ACTION_BY_ID.get(id) ?? {
      id,
      label: id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      shape: "per",
      unit: (n) => `${n} × ${id.replace(/_/g, " ")}`,
    }
  );
}

// ─── Evidence ───────────────────────────────────────────────────────────────

export type EvidenceSource = "live" | "season";

/** points -> how many times it was seen, for one value. */
type PointCounts = Map<number, number>;

/** One action for one position: value -> points -> count. */
export type Observations = Map<number, PointCounts>;

/** Every observation, by source, keyed `${position}:${action}`. */
export class Evidence {
  readonly bySource: Record<EvidenceSource, Map<string, Observations>> = { live: new Map(), season: new Map() };

  add(source: EvidenceSource, position: number, action: string, value: number, points: number, count = 1): void {
    if (value === 0) return;
    const key = `${position}:${action}`;
    const table = this.bySource[source];
    let obs = table.get(key);
    if (!obs) table.set(key, (obs = new Map()));
    let counts = obs.get(value);
    if (!counts) obs.set(value, (counts = new Map()));
    counts.set(points, (counts.get(points) ?? 0) + count);
  }

  get(source: EvidenceSource, position: number, action: string): Observations {
    return this.bySource[source].get(`${position}:${action}`) ?? new Map();
  }

  /** Every action seen in either source, catalogue actions first. */
  actions(): string[] {
    const seen = new Set<string>();
    for (const table of Object.values(this.bySource)) for (const key of table.keys()) seen.add(key.split(":")[1]);
    const known = POINT_ACTIONS.map((a) => a.id);
    return [...known, ...[...seen].filter((id) => !ACTION_BY_ID.has(id)).sort()];
  }
}

const total = (obs: Observations) => {
  let n = 0;
  for (const counts of obs.values()) for (const c of counts.values()) n += c;
  return n;
};

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface StepLevel {
  points: number;
  /** Lowest and highest value seen earning these points. */
  from: number;
  to: number;
}

export type Rule =
  | { kind: "unseen" }
  /** The data contradicts the rule's shape: shown as such, never guessed. */
  | { kind: "conflict" }
  /** `points` for each unit; 0 means no points. */
  | { kind: "per"; points: number }
  /** `points` for every `every` units. */
  | { kind: "every"; every: number; points: number }
  /** Several (every, points) pairs fit the data so far. */
  | { kind: "every-ambiguous"; options: { every: number; points: number }[] }
  /** Only 0 points seen, for values up to `maxValue`. */
  | { kind: "none-yet"; maxValue: number }
  /**
   * Points by threshold: level i applies from somewhere in
   * (levels[i-1].to, levels[i].from] upwards. Exact when levels[i].from is
   * levels[i-1].to + 1.
   */
  | { kind: "step"; levels: StepLevel[] };

const MAX_EVERY = 10;

/** Most common points for each value (when one has at least two thirds of the count), to drop the odd row a late correction made inconsistent. */
function majority(obs: Observations): Observations | null {
  const out: Observations = new Map();
  for (const [value, counts] of obs) {
    let best = 0;
    let bestCount = -1;
    let sum = 0;
    for (const [points, c] of counts) {
      sum += c;
      if (c > bestCount) [best, bestCount] = [points, c];
    }
    if (bestCount * 3 < sum * 2) return null;
    out.set(value, new Map([[best, bestCount]]));
  }
  return out;
}

/** value -> the one points total seen, or null if a value earned different points. */
function single(obs: Observations): [number, number][] | null {
  const pairs: [number, number][] = [];
  for (const [value, counts] of obs) {
    if (counts.size !== 1) return null;
    pairs.push([value, [...counts.keys()][0]]);
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}

/** Fits one rule shape to a set of observations. */
export function deriveRule(shape: RuleShape, obs: Observations): Rule {
  if (obs.size === 0) return { kind: "unseen" };
  const pairs = single(obs);
  if (!pairs) return { kind: "conflict" };
  const maxValue = pairs[pairs.length - 1][0];
  const allZero = pairs.every(([, p]) => p === 0);

  if (shape === "per") {
    const [v0, p0] = pairs[0];
    return pairs.every(([v, p]) => p * v0 === p0 * v) && Number.isInteger(p0 / v0)
      ? { kind: "per", points: p0 / v0 }
      : { kind: "conflict" };
  }

  if (shape === "every") {
    if (allZero) return { kind: "none-yet", maxValue };
    const options: { every: number; points: number }[] = [];
    for (let every = 1; every <= MAX_EVERY; every++) {
      let points: number | null = null;
      const fits = pairs.every(([v, p]) => {
        const q = Math.floor(v / every);
        if (q === 0) return p === 0;
        if (p % q !== 0) return false;
        points ??= p / q;
        return points === p / q;
      });
      if (fits && points !== null) options.push({ every, points });
    }
    if (options.length === 0) return { kind: "conflict" };
    return options.length === 1 ? { kind: "every", ...options[0] } : { kind: "every-ambiguous", options };
  }

  // step: points never go down as the value goes up.
  if (allZero) return { kind: "none-yet", maxValue };
  const levels: StepLevel[] = [];
  for (const [v, p] of pairs) {
    const last = levels[levels.length - 1];
    if (last && p < last.points) return { kind: "conflict" };
    if (last && p === last.points) last.to = v;
    else levels.push({ points: p, from: v, to: v });
  }
  return { kind: "step", levels };
}

/** The points a rule gives for a value, or undefined if the data doesn't say. */
export function predict(rule: Rule, value: number): number | undefined {
  if (value === 0) return 0;
  switch (rule.kind) {
    case "per":
      return rule.points * value;
    case "every":
      return Math.floor(value / rule.every) * rule.points;
    case "every-ambiguous": {
      const answers = new Set(rule.options.map((o) => Math.floor(value / o.every) * o.points));
      return answers.size === 1 ? [...answers][0] : undefined;
    }
    case "none-yet":
      return value <= rule.maxValue ? 0 : undefined;
    case "step": {
      const { levels } = rule;
      if (value < levels[0].from) return undefined;
      for (let i = 0; i < levels.length; i++) {
        const next = levels[i + 1];
        if (!next) return levels[i].points;
        if (value <= levels[i].to) return levels[i].points;
        if (value < next.from) return undefined;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The rule for one action and position. Live breakdown lines are direct
 * evidence; season rows are inferred, so each value keeps its majority
 * points. If adding the season's evidence breaks a rule that the live
 * evidence alone supports, the live rule wins.
 */
export function ruleFor(evidence: Evidence, position: number, action: string): Rule {
  const { shape } = pointAction(action);
  const live = evidence.get("live", position, action);
  const season = majority(evidence.get("season", position, action));
  const merged: Observations = new Map();
  for (const source of [live, season ?? new Map()]) {
    for (const [value, counts] of source) {
      const into = merged.get(value) ?? new Map<number, number>();
      for (const [p, c] of counts) into.set(p, (into.get(p) ?? 0) + c);
      merged.set(value, into);
    }
  }
  const rule = deriveRule(shape, merged);
  if (rule.kind === "conflict" && live.size > 0) {
    const liveRule = deriveRule(shape, live);
    if (liveRule.kind !== "conflict") return liveRule;
  }
  return season === null && live.size === 0 ? { kind: "conflict" } : rule;
}

// ─── Gathering evidence ─────────────────────────────────────────────────────

/** The live stats that have a line of their own in the breakdown when they earn points. */
const LIVE_STAT_ACTIONS = [
  "minutes",
  "goals_scored",
  "assists",
  "clean_sheets",
  "goals_conceded",
  "saves",
  "penalties_saved",
  "penalties_missed",
  "defensive_contribution",
  "bonus",
  "yellow_cards",
  "red_cards",
  "own_goals",
] as const;

type PointsSnapshot = Pick<Snapshot, "bootstrap" | "fixtures" | "live" | "summaries"> & Pick<Partial<Snapshot>, "previousLive">;

/**
 * The live data the rules are read from: the current gameweek's, or, while it
 * has no points breakdown yet (after the deadline, before the first kickoff),
 * the last settled gameweek's.
 */
export function pointsLive(snapshot: Pick<PointsSnapshot, "live" | "previousLive">): Snapshot["live"] {
  const hasLines = (l: Snapshot["live"] | undefined) => !!l?.elements.some((p) => p.explain.some((x) => x.stats.length > 0));
  return hasLines(snapshot.live) || !snapshot.previousLive ? snapshot.live : snapshot.previousLive;
}

/** Bounds on the minutes a clean sheet needs: at least `from`, at most `to`. Null bounds weren't seen. */
export interface MinutesBounds {
  /** Fewest minutes seen with a clean sheet. */
  minWith: number | null;
  /** Most minutes seen without one, in a match where the team conceded nothing. */
  maxWithout: number | null;
}

/**
 * The live gameweek's evidence: every breakdown line, plus a 0-point
 * observation for each stat a single-match player has but the breakdown
 * doesn't list. Also bounds the minutes a clean sheet needs, from players
 * whose team kept one (conceded nothing in the whole match).
 */
export function liveEvidence(snapshot: Pick<PointsSnapshot, "bootstrap" | "fixtures" | "live" | "previousLive">, evidence: Evidence): MinutesBounds {
  const bounds: MinutesBounds = { minWith: null, maxWithout: null };
  const live = pointsLive(snapshot);
  if (!live) return bounds;
  const elements = new Map(snapshot.bootstrap.elements.map((e) => [e.id, e]));
  const fixtures = new Map(snapshot.fixtures.map((f) => [f.id, f]));

  for (const player of live.elements) {
    const e = elements.get(player.id);
    if (!e) continue;
    const position = e.element_type;
    for (const entry of player.explain) {
      for (const line of entry.stats) evidence.add("live", position, line.identifier, line.value, line.points);
    }
    if (player.explain.length !== 1 || player.stats.minutes <= 0) continue;

    const listed = new Set(player.explain[0].stats.map((s) => s.identifier));
    for (const action of LIVE_STAT_ACTIONS) {
      if (!listed.has(action)) evidence.add("live", position, action, player.stats[action], 0);
    }

    // Clean-sheet minutes: the player's side from their club today, if it played in this fixture.
    const fixture = fixtures.get(player.explain[0].fixture);
    const conceded = fixture && concededBy(fixture, e.team);
    const minutes = player.stats.minutes;
    if (player.stats.clean_sheets > 0) {
      bounds.minWith = Math.min(bounds.minWith ?? Infinity, minutes);
    } else if (conceded === 0) {
      bounds.maxWithout = Math.max(bounds.maxWithout ?? -Infinity, minutes);
    }
  }
  return bounds;
}

/** Goals a club conceded in a fixture, or undefined if it didn't play in it or there's no score yet. */
function concededBy(fixture: Fixture, team: number): number | undefined {
  const score =
    fixture.team_h === team ? fixture.team_a_score : fixture.team_a === team ? fixture.team_h_score : undefined;
  return score ?? undefined;
}

/** An action's value in a row: exact, or a range [low, high] when the data only bounds it. */
type RowValue = number | readonly [number, number];

/** One player's match from a settled gameweek, with the value of every action the data gives. */
interface SeasonRow {
  position: number;
  total: number;
  values: Map<string, RowValue>;
}

/**
 * Player matches from settled gameweeks (confirmed fixtures only), with the
 * value of each action. Goals conceded and clean sheets aren't in the history
 * rows, so they come from the score: exact for a player who played the full
 * 90 minutes or whose club conceded nothing, otherwise a range (between 0 and
 * the goals the club conceded; a clean sheet or not).
 */
export function seasonRows(
  snapshot: Pick<PointsSnapshot, "bootstrap" | "fixtures" | "summaries">,
  cleanSheetMinutes: number | null,
): SeasonRow[] {
  const settled = new Set(snapshot.bootstrap.events.filter(isSettled).map((e) => e.id));
  const fixtures = new Map(snapshot.fixtures.map((f) => [f.id, f]));
  const elements = new Map(snapshot.bootstrap.elements.map((e) => [e.id, e]));
  // The match stats, by fixture: action -> player -> value.
  const statCache = new Map<number, Map<string, Map<number, number>>>();
  const statsOf = (f: Fixture) => {
    let byAction = statCache.get(f.id);
    if (!byAction) {
      byAction = new Map();
      for (const id of MATCH_STAT_ACTIONS) {
        byAction.set(id, new Map(matchStatRows(f, id).map((r) => [r.element, r.value])));
      }
      statCache.set(f.id, byAction);
    }
    return byAction;
  };

  const rows: SeasonRow[] = [];
  for (const [id, summary] of Object.entries(snapshot.summaries)) {
    const e = elements.get(Number(id));
    if (!e) continue;
    for (const h of summary.history) {
      if (h.minutes <= 0 || !settled.has(h.round)) continue;
      const f = fixtures.get(h.fixture);
      if (!f?.finished || f.team_h_score === null || f.team_a_score === null) continue;
      const conceded = h.was_home ? f.team_a_score : f.team_h_score;
      const full = h.minutes >= 90;
      const enough = cleanSheetMinutes !== null && h.minutes >= cleanSheetMinutes;
      const tooFew = cleanSheetMinutes !== null && h.minutes < cleanSheetMinutes;
      const values = new Map<string, RowValue>([
        ["minutes", h.minutes],
        ["goals_scored", h.goals_scored],
        ["assists", h.assists],
        ["bonus", h.bonus],
        ["defensive_contribution", h.defensive_contribution],
        ["goals_conceded", full || conceded === 0 ? conceded : [0, conceded]],
        [
          "clean_sheets",
          full ? (conceded === 0 ? 1 : 0) : tooFew ? 0 : conceded === 0 && enough ? 1 : [0, 1],
        ],
      ]);
      for (const [action, byPlayer] of statsOf(f)) values.set(action, byPlayer.get(e.id) ?? 0);
      rows.push({ position: e.element_type, total: h.total_points, values });
    }
  }
  return rows;
}

/** The actions whose per-match value comes from the fixture's match stats rather than the history row. */
const MATCH_STAT_ACTIONS = ["own_goals", "penalties_saved", "penalties_missed", "yellow_cards", "red_cards", "saves"];

/** Points for a value, or for a range when every value in it earns the same. */
function predictValue(rule: Rule, value: RowValue): number | undefined {
  if (typeof value === "number") return predict(rule, value);
  const [low, high] = value;
  const first = predict(rule, low);
  for (let v = low + 1; v <= high && first !== undefined; v++) if (predict(rule, v) !== first) return undefined;
  return first;
}

/** What a row's parts add up to under the rules, and the parts they can't value. */
function valueRow(row: SeasonRow, rules: RuleBook): { known: number; unknown: string[] } {
  let known = 0;
  const unknown: string[] = [];
  for (const [action, value] of row.values) {
    const points = predictValue(rules.get(row.position, action), value);
    if (points === undefined) unknown.push(action);
    else known += points;
  }
  return { known, unknown };
}

export class RuleBook {
  private readonly cache = new Map<string, Rule>();
  constructor(readonly evidence: Evidence) {}
  get(position: number, action: string): Rule {
    const key = `${position}:${action}`;
    let rule = this.cache.get(key);
    if (!rule) this.cache.set(key, (rule = ruleFor(this.evidence, position, action)));
    return rule;
  }
}

/** Adds season evidence: from each row whose parts are all known but one, that part is worth the rest of the total. */
function inferFromSeason(rows: readonly SeasonRow[], rules: RuleBook, into: Evidence): void {
  for (const row of rows) {
    const { known, unknown } = valueRow(row, rules);
    if (unknown.length !== 1) continue;
    const value = row.values.get(unknown[0]);
    if (typeof value !== "number" || value === 0) continue;
    into.add("season", row.position, unknown[0], value, row.total - known);
  }
}

export interface SeasonCheck {
  /** Player matches in settled gameweeks with minutes. */
  rows: number;
  /** Rows where every part could be valued. */
  checked: number;
  /** Of those, how many add up to FPL's total. */
  matched: number;
}

// ─── The page ───────────────────────────────────────────────────────────────

export interface RuleCell {
  rule: Rule;
  /** Rule in words: "+5", "+1 per 3", "+2 from 10". */
  text: string;
  /** A longer explanation for the cell's title and screen readers. */
  detail: string;
  /** How many times this action earned (or didn't earn) points in the data. */
  seen: number;
  sources: EvidenceSource[];
}

export interface RuleRow {
  action: string;
  label: string;
  cells: Record<PositionId, RuleCell>;
}

export interface ExampleLine {
  label: string;
  value: number;
  points: number;
}

export interface PointsExample {
  id: number;
  name: string;
  team: string;
  position: string;
  total: number;
  /** One group per match (two in a double gameweek). */
  matches: { fixture: number; label: string; lines: ExampleLine[] }[];
  /** Why it was picked: "Top scorer". */
  reason: string;
}

export interface PointsPage {
  /** The live gameweek the breakdown came from, or null. */
  gameweek: number | null;
  rows: RuleRow[];
  /** Minutes a clean sheet needs, as bounds; null bounds weren't seen. */
  cleanSheetMinutes: { from: number | null; to: number | null };
  examples: PointsExample[];
  season: SeasonCheck;
  /** Breakdown lines read from the live gameweek. */
  liveLines: number;
  /** Whether the data shows any rule at all (false before the season's first breakdown). */
  hasData: boolean;
}

const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A rule as short text for the table, and a sentence for its title. */
export function describeRule(action: PointAction, rule: Rule): { text: string; detail: string } {
  switch (rule.kind) {
    case "unseen":
      return { text: "Not seen", detail: "Not awarded yet in the data, so not shown." };
    case "conflict":
      return { text: "Varies", detail: "The data doesn't fit one simple rule, so it isn't stated." };
    case "per":
      return rule.points === 0
        ? { text: "0", detail: `No points: ${action.unit(1)} earned nothing.` }
        : { text: fmt(rule.points), detail: `${fmt(rule.points)} for each: ${action.unit(1)} earned ${fmt(rule.points)}.` };
    case "every":
      return rule.every === 1
        ? { text: fmt(rule.points), detail: `${fmt(rule.points)} for each.` }
        : {
            text: `${fmt(rule.points)} per ${rule.every}`,
            detail: `${fmt(rule.points)} for every ${action.unit(rule.every)}.`,
          };
    case "every-ambiguous": {
      const points = new Set(rule.options.map((o) => o.points));
      const everys = rule.options.map((o) => o.every);
      const range = `${Math.min(...everys)}–${Math.max(...everys)}`;
      return points.size === 1
        ? {
            text: `${fmt([...points][0])} per ${range}`,
            detail: `${fmt([...points][0])} for every ${range} (not enough data yet to say which).`,
          }
        : { text: "Unclear", detail: "Several rules fit the data so far." };
    }
    case "none-yet":
      // A threshold no one has reached yet is not the same as "worth nothing".
      return action.shape === "step"
        ? {
            text: "None yet",
            detail: `No one has earned points for this yet; the most seen is ${action.unit(rule.maxValue)}.`,
          }
        : { text: "0", detail: `No points seen so far, for up to ${action.unit(rule.maxValue)}.` };
    case "step": {
      const parts: string[] = [];
      const details: string[] = [];
      rule.levels.forEach((level, i) => {
        const previous = rule.levels[i - 1];
        if (!previous) {
          if (level.points !== 0) {
            parts.push(level.from > 1 ? `${fmt(level.points)} from ${level.from}` : `${fmt(level.points)}`);
            details.push(`${fmt(level.points)} from ${action.unit(level.from)}`);
          }
          return;
        }
        const exact = level.from === previous.to + 1;
        const threshold = exact ? `${level.from}` : `${previous.to + 1}–${level.from}`;
        parts.push(`${fmt(level.points)} from ${threshold}`);
        details.push(
          exact
            ? `${fmt(level.points)} from ${action.unit(level.from)} (${previous.to} earned ${fmt(previous.points)})`
            : `${fmt(level.points)} from somewhere between ${level.from > previous.to + 1 ? `${previous.to + 1} and ${level.from}` : level.from} (the most seen earning ${fmt(previous.points)} was ${previous.to}; the fewest earning ${fmt(level.points)} was ${level.from})`,
        );
      });
      if (parts.length === 0) return { text: "0", detail: "No points seen." };
      return { text: parts.join(", "), detail: `${details.join("; ")}.` };
    }
  }
}

const EXAMPLE_LIMIT = 3;

/** Line labels for the worked examples: "Played 90 minutes", "2 goals". */
function lineLabel(identifier: string, value: number): string {
  if (identifier === "minutes") return `Played ${value} minute${value === 1 ? "" : "s"}`;
  if (identifier === "clean_sheets") return "Clean sheet";
  if (identifier === "bonus") return `Bonus (${value})`;
  const unit = pointAction(identifier).unit(value);
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

function pickExamples(snapshot: Pick<PointsSnapshot, "bootstrap" | "fixtures" | "live" | "previousLive">): PointsExample[] {
  const live = pointsLive(snapshot);
  if (!live) return [];
  const elements = new Map(snapshot.bootstrap.elements.map((e) => [e.id, e]));
  const teams = new Map(snapshot.bootstrap.teams.map((t) => [t.id, t.short_name]));
  const positions = new Map(snapshot.bootstrap.element_types.map((p) => [p.id, p.singular_name_short]));
  const fixtures = new Map(snapshot.fixtures.map((f) => [f.id, f]));

  // Only players whose breakdown adds up to their total.
  const candidates = live.elements
    .filter((p) => p.explain.length > 0 && elements.has(p.id))
    .filter((p) => p.explain.flatMap((x) => x.stats).reduce((s, l) => s + l.points, 0) === p.stats.total_points)
    .sort((a, b) => b.stats.total_points - a.stats.total_points || a.id - b.id);

  const picks: { id: number; reason: string }[] = [];
  const pick = (reason: string, test: (p: (typeof candidates)[number]) => boolean) => {
    const found = candidates.find((p) => test(p) && !picks.some((x) => x.id === p.id));
    if (found) picks.push({ id: found.id, reason });
  };
  const lines = (p: (typeof candidates)[number]) => p.explain.flatMap((x) => x.stats);
  const pos = (p: (typeof candidates)[number]) => elements.get(p.id)!.element_type;

  pick("Top scorer this gameweek", () => true);
  pick("Top goalkeeper", (p) => pos(p) === 1);
  pick("A score with points taken off", (p) => lines(p).some((l) => l.points < 0));

  const matchLabel = (explain: LiveExplain) => {
    const f = fixtures.get(explain.fixture);
    if (!f) return `Match ${explain.fixture}`;
    const h = teams.get(f.team_h) ?? "—";
    const a = teams.get(f.team_a) ?? "—";
    return f.team_h_score !== null && f.team_a_score !== null ? `${h} ${f.team_h_score}–${f.team_a_score} ${a}` : `${h} v ${a}`;
  };
  const order = new Map(POINT_ACTIONS.map((a, i) => [a.id, i]));

  return picks.slice(0, EXAMPLE_LIMIT).map(({ id, reason }) => {
    const p = candidates.find((c) => c.id === id)!;
    const e = elements.get(id)!;
    return {
      id,
      name: e.web_name.trim() || `${e.first_name} ${e.second_name}`.trim(),
      team: teams.get(e.team) ?? "—",
      position: positions.get(e.element_type) ?? "—",
      total: p.stats.total_points,
      reason,
      matches: p.explain.map((x) => ({
        fixture: x.fixture,
        label: matchLabel(x),
        lines: [...x.stats]
          .sort((a, b) => (order.get(a.identifier) ?? 99) - (order.get(b.identifier) ?? 99))
          .map((l) => ({ label: lineLabel(l.identifier, l.value), value: l.value, points: l.points })),
      })),
    };
  });
}

/** How many inference passes over the season: each can value parts the last one couldn't. */
const SEASON_PASSES = 3;

/** Gathers the evidence and the rules. Exposed for tests. */
export function deriveRules(snapshot: PointsSnapshot): {
  evidence: Evidence;
  rules: RuleBook;
  cleanSheetMinutes: { from: number | null; to: number | null };
  season: SeasonCheck;
} {
  const live = new Evidence();
  const bounds = liveEvidence(snapshot, live);
  const exact = bounds.minWith !== null && bounds.maxWithout !== null && bounds.minWith === bounds.maxWithout + 1;
  const rows = seasonRows(snapshot, exact ? bounds.minWith : null);

  let evidence = live;
  let rules = new RuleBook(evidence);
  for (let pass = 0; pass < SEASON_PASSES; pass++) {
    const next = new Evidence();
    next.bySource.live = live.bySource.live;
    inferFromSeason(rows, rules, next);
    evidence = next;
    rules = new RuleBook(evidence);
  }

  let checked = 0;
  let matched = 0;
  for (const row of rows) {
    const { known, unknown } = valueRow(row, rules);
    if (unknown.length > 0) continue;
    checked++;
    if (known === row.total) matched++;
  }

  return {
    evidence,
    rules,
    cleanSheetMinutes: {
      from: bounds.maxWithout === null ? null : bounds.maxWithout + 1,
      to: bounds.minWith,
    },
    season: { rows: rows.length, checked, matched },
  };
}

/** The /points/ page's data. */
export function buildPointsPage(snapshot: PointsSnapshot): PointsPage {
  const { evidence, rules, cleanSheetMinutes, season } = deriveRules(snapshot);
  const rows: RuleRow[] = evidence.actions().map((id) => {
    const action = pointAction(id);
    const cells = {} as Record<PositionId, RuleCell>;
    for (const position of POSITION_IDS) {
      const rule = rules.get(position, id);
      const live = evidence.get("live", position, id);
      const inferred = evidence.get("season", position, id);
      cells[position] = {
        rule,
        ...describeRule(action, rule),
        seen: total(live) + total(inferred),
        sources: [...(live.size ? ["live" as const] : []), ...(inferred.size ? ["season" as const] : [])],
      };
    }
    return { action: id, label: action.label, cells };
  });

  const live = pointsLive(snapshot);
  const liveLines = live?.elements.reduce((n, p) => n + p.explain.reduce((m, x) => m + x.stats.length, 0), 0) ?? 0;
  return {
    gameweek: live?.gameweek ?? null,
    rows,
    cleanSheetMinutes,
    examples: pickExamples(snapshot),
    season,
    liveLines,
    hasData: rows.some((r) => POSITION_IDS.some((p) => r.cells[p].rule.kind !== "unseen")),
  };
}
