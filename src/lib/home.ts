// View model for the home page: the latest recap with its gameweek stats, then
// a "this week" strip (next deadline, easiest upcoming fixtures, price changes,
// most transferred in). Pure functions of the snapshot and the published
// recaps; relative imports, not `@/`, so the Vitest tests can import this file.

import {
  averageDifficulty,
  buildFixtureMatrix,
  currentGameweek,
  UK_TIME_ZONE,
  type MatrixFixture,
  type Snapshot,
} from "./fpl";
import {
  buildGameweekStats,
  buildRecapEntities,
  playerRefs,
  type GameweekStats,
  type PlayerRef,
  type RecapEntities,
} from "./recap-pages";
import { formatSeason, latestRecap, type PublishedRecap } from "./recaps";

type SnapshotParts = Pick<Snapshot, "bootstrap" | "fixtures" | "generatedAt">;

/** How many teams and players each list on the home page shows. */
export const HOME_LIST_LENGTH = 5;

export interface Deadline {
  gameweek: number;
  /** ISO timestamp. */
  time: string;
  /** "Sat 12 Sep, 11:30 UK time" */
  label: string;
}

export interface EasyRun {
  /** Short name ("BHA"). */
  team: string;
  /** Full name ("Brighton"). */
  name: string;
  /** Mean FPL difficulty over the range, as the Fixtures page's "Avg" column shows it. */
  average: number;
  /** One entry per gameweek in the range: empty for a blank, two for a double. */
  weeks: MatrixFixture[][];
}

export interface PriceMove extends PlayerRef {
  /** Price now, in £m. */
  price: number;
  /** Change since the last deadline, in £m. */
  change: number;
}

export interface TransferTarget extends PlayerRef {
  transfersIn: number;
}

export interface ThisWeek {
  /** The next deadline, or null when the season is over. */
  deadline: Deadline | null;
  /** The gameweek FPL's "this gameweek" counters run from (its deadline), or null before the season starts. */
  sinceGameweek: number | null;
  /** The gameweeks the easiest-fixtures list covers (the Fixtures page's default range). */
  fixtureRange: [number, number] | null;
  easiestFixtures: EasyRun[];
  risers: PriceMove[];
  fallers: PriceMove[];
  mostTransferredIn: TransferTarget[];
}

export interface HomeRecap {
  recap: PublishedRecap;
  seasonLabel: string;
  /** What the home page shows of it: the numbers strip and the first story card, or the first paragraph. */
  preview: PublishedRecap["body"];
  entities: RecapEntities;
  stats: GameweekStats | null;
}

/** How many story cards the home page shows after the numbers strip. */
export const HOME_RECAP_STORY_CARDS = 1;

/** The start of a recap for the home page. */
export function recapPreview(recap: PublishedRecap): PublishedRecap["body"] {
  if (recap.body.kind === "paragraphs") return { kind: "paragraphs", paragraphs: recap.body.paragraphs.slice(0, 1) };
  const numbers = recap.body.cards.find((c) => c.type === "numbers");
  const stories = recap.body.cards.filter((c) => c.type !== "numbers").slice(0, HOME_RECAP_STORY_CARDS);
  return { kind: "cards", cards: numbers ? [numbers, ...stories] : stories };
}

export interface HomePage {
  /** Null until the first recap is published: the page then opens on the "this week" strip. */
  latest: HomeRecap | null;
  thisWeek: ThisWeek;
}

const deadlineFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Sat 12 Sep, 11:30 UK time". Fixed to UK time so the static page is the same wherever it's built. */
export function formatDeadline(iso: string): string {
  return `${deadlineFormat.format(new Date(iso))} UK time`;
}

export function nextDeadline(events: SnapshotParts["bootstrap"]["events"]): Deadline | null {
  const next = events.find((e) => e.is_next);
  if (!next?.deadline_time) return null;
  return { gameweek: next.id, time: next.deadline_time, label: formatDeadline(next.deadline_time) };
}

/**
 * The teams with the lowest average difficulty over the Fixtures page's
 * default range (from the next gameweek), using the same matrix and average.
 * Ties go to the team with more fixtures (a double), then by name. Teams with
 * no fixtures in the range are left out.
 */
export function easiestFixtures(
  snapshot: Pick<SnapshotParts, "bootstrap" | "fixtures">,
  limit = HOME_LIST_LENGTH,
): { range: [number, number] | null; teams: EasyRun[] } {
  const matrix = buildFixtureMatrix(snapshot.bootstrap, snapshot.fixtures);
  const [from, to] = matrix.defaultRange;
  const fullName = new Map(snapshot.bootstrap.teams.map((t) => [t.short_name, t.name]));

  const teams = matrix.rows
    .map((row) => {
      const weeks = row.weeks.slice(from - 1, to);
      return {
        team: row.team,
        name: fullName.get(row.team) ?? row.team,
        average: averageDifficulty(row, from, to),
        weeks,
        count: weeks.reduce((n, w) => n + w.length, 0),
      };
    })
    .filter((t): t is typeof t & { average: number } => t.average !== undefined)
    .sort((a, b) => a.average - b.average || b.count - a.count || a.team.localeCompare(b.team))
    .slice(0, limit)
    .map(({ team, name, average, weeks }) => ({ team, name, average, weeks }));

  return { range: teams.length ? [from, to] : null, teams };
}

const toMillions = (tenths: number) => Math.round(tenths) / 10;

/** Biggest price rises and falls since the last deadline; ties go to the more-owned player. */
export function priceMoves(
  bootstrap: SnapshotParts["bootstrap"],
  limit = HOME_LIST_LENGTH,
): { risers: PriceMove[]; fallers: PriceMove[] } {
  const ref = playerRefs(bootstrap);
  const moves = bootstrap.elements
    .filter((e) => e.cost_change_event !== 0)
    .map((e) => ({ e, ref: ref(e.id)! }))
    .map(({ e, ref }) => ({
      move: { ...ref, price: toMillions(e.now_cost), change: toMillions(e.cost_change_event) },
      owned: Number(e.selected_by_percent),
    }));
  const pick = (rising: boolean) =>
    moves
      .filter((m) => (rising ? m.move.change > 0 : m.move.change < 0))
      .sort((a, b) => (rising ? b.move.change - a.move.change : a.move.change - b.move.change) || b.owned - a.owned || a.move.id - b.move.id)
      .slice(0, limit)
      .map((m) => m.move);
  return { risers: pick(true), fallers: pick(false) };
}

/** Most transferred in since the last deadline. */
export function mostTransferredIn(
  bootstrap: SnapshotParts["bootstrap"],
  limit = HOME_LIST_LENGTH,
): TransferTarget[] {
  const ref = playerRefs(bootstrap);
  return bootstrap.elements
    .filter((e) => e.transfers_in_event > 0)
    .sort((a, b) => b.transfers_in_event - a.transfers_in_event || a.id - b.id)
    .slice(0, limit)
    .map((e) => ({ ...ref(e.id)!, transfersIn: e.transfers_in_event }));
}

export function buildThisWeek(snapshot: SnapshotParts): ThisWeek {
  const { bootstrap } = snapshot;
  const fixtures = easiestFixtures(snapshot);
  return {
    deadline: nextDeadline(bootstrap.events),
    sinceGameweek: currentGameweek(bootstrap.events),
    fixtureRange: fixtures.range,
    easiestFixtures: fixtures.teams,
    ...priceMoves(bootstrap),
    mostTransferredIn: mostTransferredIn(bootstrap),
  };
}

export function buildHomePage(snapshot: SnapshotParts, recaps: readonly PublishedRecap[]): HomePage {
  const recap = latestRecap(recaps);
  return {
    latest: recap
      ? {
          recap,
          seasonLabel: formatSeason(recap.season),
          preview: recapPreview(recap),
          entities: buildRecapEntities(snapshot, recap),
          stats: buildGameweekStats(snapshot, recap.season, recap.gameweek),
        }
      : null,
    thisWeek: buildThisWeek(snapshot),
  };
}
