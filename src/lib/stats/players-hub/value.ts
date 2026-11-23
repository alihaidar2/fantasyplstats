// Value rankings by position: season points, expected goal involvements (xGI)
// and form, each per £m of current price. Players need a minimum of season
// minutes, so someone with one cameo goal doesn't top the list.

import type { Bootstrap } from "../../fpl/schemas";
import { hubPlayers, roundTo, type HubPlayer } from "./common";

export type ValueMetricId = "points" | "xgi" | "form";

export interface ValueRow extends HubPlayer {
  /** The metric per £m. */
  value: number;
  /** What was divided by the price: season points, season xGI or form. */
  base: number;
  minutes: number;
}

export interface ValueMetric {
  id: ValueMetricId;
  /** "Points per £m". */
  label: string;
  /** Column label for the base value ("Points"). */
  baseLabel: string;
  positions: { positionId: number; label: string; players: ValueRow[] }[];
}

export interface ValueRankings {
  /** Players need at least this many minutes this season to be ranked. */
  minMinutes: number;
  /** Finished gameweeks the threshold is based on. */
  finishedGameweeks: number;
  metrics: ValueMetric[];
}

/** How many players each position's list shows. */
export const VALUE_LIST_LENGTH = 10;

/**
 * Half the minutes available so far (45 per finished gameweek), and at least
 * one full match: 450 minutes after ten gameweeks.
 */
export function valueMinutesThreshold(finishedGameweeks: number): number {
  return Math.max(90, 45 * finishedGameweeks);
}

interface MetricSpec {
  id: ValueMetricId;
  label: string;
  baseLabel: string;
  /** Positions ranked (goalkeepers have almost no xGI, so they aren't ranked on it). */
  positions: readonly number[];
  base: (e: Bootstrap["elements"][number]) => number;
}

const METRICS: MetricSpec[] = [
  { id: "points", label: "Points per £m", baseLabel: "Points", positions: [1, 2, 3, 4], base: (e) => e.total_points },
  {
    id: "xgi",
    label: "xGI per £m",
    baseLabel: "xGI",
    positions: [2, 3, 4],
    base: (e) => Number(e.expected_goal_involvements),
  },
  { id: "form", label: "Form per £m", baseLabel: "Form", positions: [1, 2, 3, 4], base: (e) => Number(e.form) },
];

export function buildValueRankings(
  bootstrap: Pick<Bootstrap, "teams" | "element_types" | "elements" | "events">,
  limit = VALUE_LIST_LENGTH,
): ValueRankings {
  const finishedGameweeks = bootstrap.events.filter((e) => e.finished).length;
  const minMinutes = valueMinutesThreshold(finishedGameweeks);
  const toPlayer = hubPlayers(bootstrap);
  const plural = new Map(bootstrap.element_types.map((p) => [p.id, p.plural_name]));

  // "Unavailable" players have left the club or gone on loan, so they can't
  // score for an FPL team; injured and doubtful players stay, with their badge.
  const eligible = bootstrap.elements.filter((e) => e.minutes >= minMinutes && e.now_cost > 0 && e.status !== "u");

  const metrics = METRICS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    baseLabel: spec.baseLabel,
    positions: spec.positions.map((positionId) => ({
      positionId,
      label: plural.get(positionId) ?? `Position ${positionId}`,
      players: eligible
        .filter((e) => e.element_type === positionId)
        .map((e) => {
          const base = spec.base(e);
          return { e, base, exact: base / (e.now_cost / 10) };
        })
        .filter((r) => r.base > 0)
        .sort(
          (a, b) =>
            b.exact - a.exact ||
            Number(b.e.selected_by_percent) - Number(a.e.selected_by_percent) ||
            a.e.id - b.e.id,
        )
        .slice(0, limit)
        .map(({ e, base, exact }) => ({ ...toPlayer(e), value: roundTo(exact, 2), base, minutes: e.minutes })),
    })),
  }));

  return { minMinutes, finishedGameweeks, metrics };
}
