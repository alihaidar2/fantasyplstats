import { z } from "zod";
import type { ContextPlayer } from "../context";
import { fold } from "../names";
import { defineTool } from "./tool";
import {
  formatPrice,
  label,
  limitInput,
  nameIndexOf,
  ownershipOf,
  ownershipRatio,
  positionInput,
  priceOf,
  resolveTeam,
  seasonTotals,
  teamInput,
  topBy,
} from "./shared";

const SORTS = ["gameweek points", "season points", "ownership", "price"] as const;

export const findPlayers = defineTool({
  name: "find_players",
  description:
    "Search for players, to get the ref other tools take or to list a club's or position's players. Filter by " +
    "name (part of a name is enough), club, position and a minimum score this gameweek, and choose how to sort. " +
    "Each row has the player's points and minutes this gameweek, season points so far, price and ownership. " +
    "Only players who existed by this gameweek are listed. Ownership is missing for a player whose club had no " +
    "match this gameweek.",
  input: z.object({
    name: z.string().min(1).optional().describe('All or part of a name, e.g. "Fernandes" or "Bruno".'),
    team: teamInput.optional(),
    position: positionInput.optional(),
    minPoints: z.number().int().optional().describe("Only players with at least this many points this gameweek."),
    sortBy: z.enum(SORTS).default("gameweek points").describe("How to order the results, highest first."),
    limit: limitInput(10),
  }),
  run(context, input) {
    const team = input.team === undefined ? undefined : resolveTeam(context, input.team);

    let named: Set<number> | undefined;
    if (input.name !== undefined) {
      const ids = nameIndexOf(context)
        .lookupPlayer(input.name)
        .filter((id) => context.playerById.has(id));
      if (ids.length > 0) {
        named = new Set(ids);
      } else {
        // Not a whole name: match part of one, ignoring case and accents.
        const needle = fold(input.name).toLowerCase().trim();
        named = new Set(
          context.players
            .filter((p) => fold(`${p.name} ${p.fullName}`).toLowerCase().includes(needle))
            .map((p) => p.id),
        );
      }
    }

    const candidates = context.players.filter(
      (p) =>
        (!named || named.has(p.id)) &&
        (!team || p.teamId === team.id) &&
        (!input.position || p.position === input.position) &&
        (input.minPoints === undefined || p.gw.points >= input.minPoints),
    );

    const score: Record<(typeof SORTS)[number], (p: ContextPlayer) => number> = {
      "gameweek points": (p) => p.gw.points,
      "season points": (p) => seasonTotals(p).points,
      ownership: (p) => ownershipRatio(context, p) ?? -1,
      price: (p) => priceOf(p) ?? -1,
    };

    const players = topBy(candidates, score[input.sortBy], input.limit, (p) => p.id).map((p) => {
      const price = priceOf(p);
      return {
        ...label(context, p),
        fullName: p.fullName,
        points: p.gw.points,
        minutes: p.gw.minutes,
        seasonPoints: seasonTotals(p).points,
        ...(price !== undefined ? { price: formatPrice(price) } : {}),
        ...ownershipOf(context, p),
      };
    });

    return {
      gameweek: context.gameweek,
      matched: candidates.length,
      ...(players.length ? {} : { note: "No player matches. Try part of the name, or fewer filters." }),
      players,
    };
  },
});
