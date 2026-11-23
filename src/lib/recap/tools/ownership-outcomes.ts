import { z } from "zod";
import type { ContextPlayer, GameweekContext } from "../context";
import { defineTool } from "./tool";
import { label, limitInput, ownershipOf, ownershipRatio, roundOf, topBy } from "./shared";

/** Owned by at least this share of managers: enough for a no-show to matter. */
const WIDELY_OWNED = 0.05;
/** A differential: owned by less than this share. */
const DIFFERENTIAL_BELOW = 0.05;
const DIFFERENTIAL_MIN_POINTS = 8;

/** A goal or an assist, or a clean sheet for a goalkeeper or defender. */
const returned = (p: ContextPlayer) =>
  p.gw.goals + p.gw.assists > 0 || ((p.position === "GKP" || p.position === "DEF") && p.gw.cleanSheets > 0);

function outcome(context: GameweekContext, player: ContextPlayer) {
  return { ...label(context, player), ...ownershipOf(context, player), points: player.gw.points };
}

/** For the players a manager was counting on: did they play, and did they deliver? */
function delivery(context: GameweekContext, player: ContextPlayer) {
  return {
    ...outcome(context, player),
    minutes: player.gw.minutes,
    goals: player.gw.goals,
    assists: player.gw.assists,
    returned: returned(player),
  };
}

export const ownershipOutcomes = defineTool({
  name: "ownership_outcomes",
  description:
    "How the players managers owned got on this gameweek: the most-owned players and whether they returned (a " +
    "goal or assist, or a clean sheet for a goalkeeper or defender), " +
    "widely owned players (5% or more) who didn't play a minute, low-owned differentials who scored well (under " +
    "5% owned, 8 points or more), the most-captained player's result, and the players most bought and most sold " +
    "before the deadline with what they then scored. Ownership is each player's figure at this gameweek's " +
    "deadline. Gameweek 1 has no transfers, so it has no bought or sold lists. FPL records ownership per " +
    "fixture, so a player whose club had no match this gameweek has no ownership figure and appears in no list.",
  input: z.object({ limit: limitInput(4, 10) }),
  run(context, input) {
    // Ownership comes from the history row, so only players whose club played have one.
    const owned = context.players
      .map((player) => ({ player, ratio: ownershipRatio(context, player) }))
      .filter((o): o is { player: ContextPlayer; ratio: number } => o.ratio !== undefined);

    const mostOwned = topBy(owned, (o) => o.ratio, input.limit, (o) => o.player.id).map((o) =>
      delivery(context, o.player),
    );

    // "Didn't play" is zero minutes, whether or not the live data listed them.
    const noShows = owned.filter((o) => o.ratio >= WIDELY_OWNED && o.player.gw.minutes === 0);
    const ownedButDidNotPlay = topBy(noShows, (o) => o.ratio, input.limit, (o) => o.player.id).map((o) => ({
      ...outcome(context, o.player),
      minutes: o.player.gw.minutes,
    }));

    const differentials = topBy(
      owned.filter((o) => o.ratio < DIFFERENTIAL_BELOW && o.player.gw.points >= DIFFERENTIAL_MIN_POINTS),
      (o) => o.player.gw.points,
      input.limit,
      (o) => o.player.id,
    ).map((o) => ({ ...outcome(context, o.player), goals: o.player.gw.goals, assists: o.player.gw.assists }));

    const captain =
      context.event.mostCaptainedId === null ? undefined : context.playerById.get(context.event.mostCaptainedId);

    const transfers = () => {
      const moved = context.players
        .map((player) => ({ player, balance: roundOf(player, context.gameweek)?.transfersBalance ?? 0 }))
        .filter((m) => m.balance !== 0);
      const row = (m: { player: ContextPlayer; balance: number }) => ({
        ...outcome(context, m.player),
        netTransfersIn: m.balance,
      });
      return {
        mostBoughtBeforeDeadline: topBy(moved.filter((m) => m.balance > 0), (m) => m.balance, input.limit, (m) => m.player.id).map(row),
        mostSoldBeforeDeadline: topBy(moved.filter((m) => m.balance < 0), (m) => -m.balance, input.limit, (m) => m.player.id).map(row),
      };
    };

    return {
      gameweek: context.gameweek,
      ...(context.managers.has(context.gameweek)
        ? {}
        : { note: "FPL has no manager count for this gameweek, so there are no ownership percentages or lists." }),
      mostOwned,
      ownedButDidNotPlay,
      differentials,
      ...(captain
        ? { mostCaptained: delivery(context, captain) }
        : {}),
      ...(context.hasTransfers
        ? transfers()
        : { transfersNote: "Gameweek 1 has no transfers, so there are no most-bought or most-sold players." }),
    };
  },
});
