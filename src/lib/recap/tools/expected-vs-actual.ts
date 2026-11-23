import { z } from "zod";
import type { ContextPlayer } from "../context";
import { defineTool } from "./tool";
import { label, limitInput, round2, seasonTotals, topBy } from "./shared";

/** In season scope, an underperformer needs at least this much expected output to be worth a mention. */
const MIN_SEASON_EXPECTED = 1;

interface Line {
  player: ContextPlayer;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  /** Expected goal involvements. */
  xGI: number;
  /** Goals plus assists, minus xG plus xA. */
  difference: number;
  points?: number;
}

export const expectedVsActual = defineTool({
  name: "expected_vs_actual",
  description:
    "Who beat or fell short of their expected goals (xG) and expected assists (xA). With scope \"gameweek\" it " +
    "covers this gameweek; with scope \"season\" it covers the season up to and including this gameweek. " +
    "Returns overperformers (goals and assists well above xG plus xA), underperformers (in a gameweek: the " +
    "highest xG plus xA with no goal or assist; over the season: the biggest shortfall), and the highest " +
    "expected goal involvements regardless of output. `difference` is goals plus assists minus xG plus xA. " +
    "It has no shot counts or chance details, only FPL's expected figures.",
  input: z.object({
    scope: z
      .enum(["gameweek", "season"])
      .default("gameweek")
      .describe('"gameweek" for this gameweek only, "season" for the season so far.'),
    limit: limitInput(5, 10),
  }),
  run(context, input) {
    const season = input.scope === "season";
    const lines: Line[] = context.players.map((player) => {
      if (season) {
        const t = seasonTotals(player);
        return {
          player, goals: t.goals, assists: t.assists, xG: t.xG, xA: t.xA,
          xGI: round2(t.xG + t.xA),
          difference: round2(t.goals + t.assists - t.xG - t.xA),
        };
      }
      const gw = player.gw;
      return {
        player, goals: gw.goals, assists: gw.assists, xG: round2(gw.xG), xA: round2(gw.xA),
        // The live data's own xGI; a line rebuilt from history has none.
        xGI: round2(gw.xGI || gw.xG + gw.xA),
        difference: round2(gw.goals + gw.assists - gw.xG - gw.xA),
        points: gw.points,
      };
    });

    const row = (l: Line) => ({
      ...label(context, l.player),
      goals: l.goals,
      assists: l.assists,
      xG: l.xG,
      xA: l.xA,
      xGI: l.xGI,
      difference: l.difference,
      ...(l.points !== undefined ? { points: l.points } : {}),
    });
    const id = (l: Line) => l.player.id;
    const expected = (l: Line) => l.xG + l.xA;

    const overperformers = topBy(
      lines.filter((l) => l.goals + l.assists > 0 && l.difference > 0),
      (l) => l.difference,
      input.limit,
      id,
    );
    const underperformers = season
      ? topBy(
          lines.filter((l) => l.difference < 0 && expected(l) >= MIN_SEASON_EXPECTED),
          (l) => -l.difference,
          input.limit,
          id,
        )
      : topBy(
          lines.filter((l) => l.goals + l.assists === 0 && expected(l) > 0),
          expected,
          input.limit,
          id,
        );
    const highestExpected = topBy(lines.filter((l) => l.xGI > 0), (l) => l.xGI, input.limit, id);

    return {
      gameweek: context.gameweek,
      scope: season ? "the season up to and including this gameweek" : "this gameweek",
      overperformers: overperformers.map(row),
      underperformers: underperformers.map(row),
      highestExpected: highestExpected.map(row),
    };
  },
});
