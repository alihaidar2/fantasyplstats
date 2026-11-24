import { z } from "zod";
import type { ContextPlayer } from "../context";
import { defineTool } from "./tool";
import {
  formatPercent,
  formatPrice,
  formatPriceChange,
  gameweekOutcome,
  label,
  limitInput,
  roundOf,
  topBy,
} from "./shared";

export const transferStory = defineTool({
  name: "transfer_story",
  description:
    "The transfer market before this gameweek's deadline, and whether it paid off: FPL's most-transferred-in " +
    "player, the players with the biggest net transfers in and the biggest net transfers out, each with what they " +
    "then scored this gameweek (points, minutes, goals, assists, and a one-phrase outcome), their ownership before " +
    "and after, and their price move. Also the total transfers managers made, and flags for a season high: the " +
    "most transfers in one gameweek so far, and the biggest net move in or out for any player so far. Use it for " +
    "every recap after Gameweek 1: bandwagons and sell-offs that backfire or pay off are stories managers care " +
    "about. FPL publishes net transfers (in minus out) per player, not the two separately. A player whose club " +
    "had no match this gameweek has no figure. Gameweek 1 has no transfers.",
  input: z.object({ limit: limitInput(5, 10) }),
  run(context, input) {
    const { gameweek } = context;
    if (!context.hasTransfers) {
      return { gameweek, note: "Gameweek 1 has no transfers: every squad was picked from scratch." };
    }
    const managersNow = context.managers.get(gameweek);

    const moved = context.players
      .map((player) => ({ player, balance: roundOf(player, gameweek)?.transfersBalance ?? 0 }))
      .filter((m) => m.balance !== 0);

    // Every player's net move in every gameweek so far, for the season-high flags.
    const earlier = context.players.flatMap((player) =>
      player.rounds.filter((r) => r.gameweek > 1 && r.gameweek < gameweek).map((r) => ({ player, gameweek: r.gameweek, balance: r.transfersBalance })),
    );
    const biggestInBefore = topBy(earlier, (e) => e.balance, 1, (e) => e.player.id)[0];
    const biggestOutBefore = topBy(earlier, (e) => -e.balance, 1, (e) => e.player.id)[0];

    const biggestInNow = Math.max(0, ...moved.map((m) => m.balance));
    const biggestOutNow = Math.min(0, ...moved.map((m) => m.balance));

    const row = (player: ContextPlayer, balance: number) => {
      const round = roundOf(player, gameweek);
      const previous = player.rounds.filter((r) => r.gameweek < gameweek).at(-1);
      const managersBefore = previous ? context.managers.get(previous.gameweek) : undefined;
      // Only the gameweek's biggest mover can hold the season high.
      const seasonHigh =
        balance > 0
          ? { biggestNetTransfersInOfTheSeasonSoFar: balance === biggestInNow && (!biggestInBefore || balance > biggestInBefore.balance) }
          : { biggestNetTransfersOutOfTheSeasonSoFar: balance === biggestOutNow && (!biggestOutBefore || balance < biggestOutBefore.balance) };
      return {
        ...gameweekOutcome(context, player),
        ...(balance >= 0 ? { netTransfersIn: balance } : { netTransfersOut: -balance }),
        ...(previous && managersBefore ? { ownershipBefore: formatPercent(previous.owners / managersBefore) } : {}),
        ...(round ? { price: formatPrice(round.price) } : {}),
        ...(round && previous ? { priceChange: formatPriceChange(round.price - previous.price) } : {}),
        ...(gameweek > 2 ? seasonHigh : {}),
      };
    };

    const fplPick = context.event.mostTransferredInId === null ? undefined : context.playerById.get(context.event.mostTransferredInId);
    const transfersMade = context.seasonEvents.find((e) => e.gameweek === gameweek)?.transfersMade;
    const madeBefore = context.seasonEvents
      .filter((e) => e.gameweek > 1 && e.gameweek < gameweek && e.transfersMade !== null)
      .map((e) => ({ gameweek: e.gameweek, transfersMade: e.transfersMade! }));
    const previousHigh = topBy(madeBefore, (e) => e.transfersMade, 1, (e) => e.gameweek)[0];

    return {
      gameweek,
      ...(managersNow ? {} : { note: "FPL has no manager count for this gameweek, so there are no ownership percentages." }),
      ...(transfersMade != null
        ? {
            allManagers: {
              transfersMade,
              ...(previousHigh
                ? {
                    mostTransfersInAGameweekSoFar: transfersMade > previousHigh.transfersMade,
                    previousHigh: { gameweek: previousHigh.gameweek, transfersMade: previousHigh.transfersMade },
                  }
                : {}),
            },
          }
        : {}),
      ...(fplPick
        ? { mostTransferredIn: row(fplPick, roundOf(fplPick, gameweek)?.transfersBalance ?? 0) }
        : {}),
      biggestNetTransfersIn: topBy(moved.filter((m) => m.balance > 0), (m) => m.balance, input.limit, (m) => m.player.id).map((m) =>
        row(m.player, m.balance),
      ),
      biggestNetTransfersOut: topBy(moved.filter((m) => m.balance < 0), (m) => -m.balance, input.limit, (m) => m.player.id).map((m) =>
        row(m.player, m.balance),
      ),
      ...(gameweek > 2 && biggestInBefore && biggestOutBefore
        ? {
            seasonHighsBeforeThisGameweek: {
              biggestNetTransfersIn: { ...label(context, biggestInBefore.player), gameweek: biggestInBefore.gameweek, netTransfersIn: biggestInBefore.balance },
              ...(biggestOutBefore.balance < 0
                ? { biggestNetTransfersOut: { ...label(context, biggestOutBefore.player), gameweek: biggestOutBefore.gameweek, netTransfersOut: -biggestOutBefore.balance } }
                : {}),
            },
          }
        : {}),
    };
  },
});
