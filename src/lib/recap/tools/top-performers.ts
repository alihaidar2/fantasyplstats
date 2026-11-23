import { z } from "zod";
import { defineTool } from "./tool";
import {
  formatPrice,
  label,
  limitInput,
  ownershipOf,
  ownershipRatio,
  positionInput,
  resolveTeam,
  roundOf,
  seasonTotals,
  teamInput,
  topBy,
} from "./shared";

export const topPerformers = defineTool({
  name: "top_performers",
  description:
    "The gameweek's highest-scoring players, with goals, assists, bonus, price and ownership at the deadline, and " +
    "their season points so far. Filter by position or club, or set maxOwnershipPercent to find differentials " +
    "(low-owned players who scored well). Also says how many players scored 10 or more. A player whose club had " +
    "no match this gameweek has no price or ownership figure, and is left out when maxOwnershipPercent is set.",
  input: z.object({
    limit: limitInput(10),
    position: positionInput.optional(),
    team: teamInput.optional(),
    maxOwnershipPercent: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Only players owned by at most this percentage of managers, e.g. 5 for differentials."),
  }),
  run(context, input) {
    const team = input.team === undefined ? undefined : resolveTeam(context, input.team);
    const maxRatio = input.maxOwnershipPercent === undefined ? undefined : input.maxOwnershipPercent / 100;

    const candidates = context.players.filter((p) => {
      if (input.position && p.position !== input.position) return false;
      if (team && p.teamId !== team.id) return false;
      if (maxRatio !== undefined) {
        const ratio = ownershipRatio(context, p);
        if (ratio === undefined || ratio > maxRatio) return false;
      }
      return p.gw.minutes > 0 || p.gw.points !== 0;
    });

    const players = topBy(candidates, (p) => p.gw.points, input.limit, (p) => p.id).map((p) => {
      const round = roundOf(p, context.gameweek);
      return {
        ...label(context, p),
        points: p.gw.points,
        minutes: p.gw.minutes,
        goals: p.gw.goals,
        assists: p.gw.assists,
        bonus: p.gw.bonus,
        ...(p.gw.cleanSheets ? { cleanSheets: p.gw.cleanSheets } : {}),
        ...(p.gw.saves ? { saves: p.gw.saves } : {}),
        ...(round ? { price: formatPrice(round.price) } : {}),
        ...ownershipOf(context, p),
        seasonPoints: seasonTotals(p).points,
      };
    });

    return {
      gameweek: context.gameweek,
      ...(players.length ? {} : { note: "No player matches those filters this gameweek." }),
      players,
      doubleDigitHauls: context.players.filter((p) => p.gw.points >= 10).length,
    };
  },
});
