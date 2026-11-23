import { z } from "zod";
import type { ContextPlayer, GameweekContext } from "../context";
import { defineTool } from "./tool";
import { formatPrice, formatPriceChange, label, limitInput, ownershipOf, roundOf, topBy } from "./shared";

interface Move {
  player: ContextPlayer;
  /** Tenths of a million. */
  change: number;
  price: number;
  owners: number;
}

/** Ownership as a percentage only, to keep the rows short. */
function share(context: GameweekContext, player: ContextPlayer) {
  const ownership = ownershipOf(context, player)?.ownership;
  return ownership ? { ownership } : {};
}

function movers(context: GameweekContext, moves: readonly Move[], direction: 1 | -1, limit: number, detail: boolean) {
  return topBy(
    moves.filter((m) => m.change * direction > 0),
    (m) => m.change * direction,
    limit,
    // Among equal moves, the most widely owned first.
    (m) => -m.owners,
  ).map((m) => ({
    ...label(context, m.player),
    priceChange: formatPriceChange(m.change),
    price: formatPrice(m.price),
    ...(detail ? { points: m.player.gw.points, ...share(context, m.player) } : {}),
  }));
}

export const priceChanges = defineTool({
  name: "price_changes",
  description:
    "Price moves going into this gameweek: the biggest risers and fallers since the previous gameweek, and since " +
    "each player's first gameweek of the season (a shorter list), with their price at this gameweek's deadline " +
    "and, for this week's movers, their points this gameweek and ownership. Among equal moves the most widely " +
    "owned come first. Prices are the ones recorded at each gameweek, never today's, so changes after " +
    "this gameweek's deadline are not included. Players whose club had no match this gameweek have no price row " +
    "and are left out. Gameweek 1 has no transfers and no earlier price, so it has no price changes.",
  input: z.object({ limit: limitInput(5) }),
  run(context, input) {
    if (!context.hasTransfers) {
      return {
        gameweek: context.gameweek,
        note: "Gameweek 1 has no transfers and no earlier price, so there are no price changes to report.",
      };
    }

    const sinceLast: Move[] = [];
    const sinceFirst: Move[] = [];
    for (const player of context.players) {
      const round = roundOf(player, context.gameweek);
      if (!round) continue;
      const previous = player.rounds.filter((r) => r.gameweek < context.gameweek).at(-1);
      if (!previous) continue;
      const base = { player, price: round.price, owners: round.owners };
      sinceLast.push({ ...base, change: round.price - previous.price });
      sinceFirst.push({ ...base, change: round.price - player.rounds[0].price });
    }

    return {
      gameweek: context.gameweek,
      sinceLastGameweek: {
        playersWhoRose: sinceLast.filter((m) => m.change > 0).length,
        playersWhoFell: sinceLast.filter((m) => m.change < 0).length,
        risers: movers(context, sinceLast, 1, input.limit, true),
        fallers: movers(context, sinceLast, -1, input.limit, true),
      },
      sinceFirstGameweek: {
        // A shorter list: the season-long movers change little from week to week.
        risers: movers(context, sinceFirst, 1, Math.min(input.limit, 3), false),
        fallers: movers(context, sinceFirst, -1, Math.min(input.limit, 3), false),
      },
    };
  },
});
