import { z } from "zod";
import type { ContextPlayer, GameweekContext, SeasonEvent } from "../context";
import { defineTool } from "./tool";
import { CHIP_NAMES, formatPercent, gameweekOutcome, label, limitInput, ownershipRatio, topBy } from "./shared";

const TRIPLE_CAPTAIN = "3xc";

const chipPlays = (event: SeasonEvent, chip: string) => event.chipPlays.find((c) => c.chip === chip)?.played ?? 0;

/** How many gameweeks in a row, ending with this one, the same player has been `pick`. */
function runAs(context: GameweekContext, pick: (event: SeasonEvent) => number | null): number {
  const events = context.seasonEvents;
  const current = events.at(-1);
  if (!current || pick(current) === null) return 0;
  let run = 0;
  for (let i = events.length - 1; i >= 0 && pick(events[i]) === pick(current); i--) run++;
  return run;
}

export const captaincy = defineTool({
  name: "captaincy",
  description:
    "The captaincy story of the gameweek: the most-captained and most-vice-captained players and what they scored " +
    "(with the doubled score a captain earned and the tripled score a Triple Captain earned), how many gameweeks " +
    "in a row the same player has been most captained, how the most-owned players did (the realistic alternative " +
    "captains), the best score among them, and every chip played with its share of managers. Flags say when this " +
    "gameweek's count for a chip is the highest of the season so far, with the previous high. Use it for every " +
    "recap: the captain's result affects more managers than anything else. FPL does not say how many managers " +
    "captained each player, or which player Triple Captains were played on: only who was most captained.",
  input: z.object({ limit: limitInput(5, 10) }),
  run(context, input) {
    const { gameweek } = context;
    const managers = context.managers.get(gameweek);
    const thisEvent = context.seasonEvents.find((e) => e.gameweek === gameweek);
    const several = context.seasonEvents.length > 1;

    const captainId = context.event.mostCaptainedId;
    const captain = captainId === null ? undefined : context.playerById.get(captainId);
    const viceId = thisEvent?.mostViceCaptainedId ?? null;
    const vice = viceId === null ? undefined : context.playerById.get(viceId);

    const owned = context.players
      .map((player) => ({ player, ratio: ownershipRatio(context, player) }))
      .filter((o): o is { player: ContextPlayer; ratio: number } => o.ratio !== undefined);
    const mostOwned = topBy(owned, (o) => o.ratio, input.limit, (o) => o.player.id).map((o) => o.player);
    const bestOfThem = topBy(mostOwned, (p) => p.gw.points, 1, (p) => p.id)[0];

    const chips = (thisEvent?.chipPlays ?? []).map((c) => {
      const before = context.seasonEvents
        .filter((e) => e.gameweek < gameweek)
        .map((e) => ({ gameweek: e.gameweek, played: chipPlays(e, c.chip) }));
      const previousHigh = topBy(before, (b) => b.played, 1, (b) => b.gameweek)[0];
      return {
        chip: CHIP_NAMES[c.chip] ?? c.chip,
        played: c.played,
        ...(managers ? { shareOfManagers: formatPercent(c.played / managers) } : {}),
        ...(several && previousHigh
          ? {
              mostPlayedInAGameweekSoFar: c.played > previousHigh.played,
              previousHigh: { chip: CHIP_NAMES[c.chip] ?? c.chip, gameweek: previousHigh.gameweek, played: previousHigh.played },
            }
          : {}),
      };
    });
    const tripleCaptain = chips.find((c) => c.chip === CHIP_NAMES[TRIPLE_CAPTAIN]);

    return {
      gameweek,
      ...(captain
        ? {
            mostCaptained: {
              ...gameweekOutcome(context, captain),
              captainPoints: captain.gw.points * 2,
              tripleCaptainPoints: captain.gw.points * 3,
              gameweeksInARowAsMostCaptained: runAs(context, (e) => e.mostCaptainedId),
              wasTheGameweekTopScorer: context.event.topScorer?.playerId === captain.id,
            },
          }
        : { note: "FPL has not named a most-captained player for this gameweek." }),
      ...(vice ? { mostViceCaptained: gameweekOutcome(context, vice) } : {}),
      ...(tripleCaptain
        ? {
            tripleCaptain: {
              ...tripleCaptain,
              note:
                "FPL does not say which players the Triple Captains were on. Most go on the most-captained player, " +
                "so report their tripled score as what a Triple Captain on them earned, not as what every chip user got.",
            },
          }
        : {}),
      mostOwnedPlayers: mostOwned.map((p) => gameweekOutcome(context, p)),
      ...(bestOfThem && captain && bestOfThem.id !== captain.id && bestOfThem.gw.points > captain.gw.points
        ? { bestScoreAmongTheMostOwned: { ...label(context, bestOfThem), points: bestOfThem.gw.points, captainPoints: bestOfThem.gw.points * 2 } }
        : {}),
      chips,
    };
  },
});
