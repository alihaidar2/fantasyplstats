import { z } from "zod";
import type { ContextPlayer, GameweekLine } from "../context";
import { defineTool } from "./tool";
import { label, limitInput, ownershipOf, ownershipRatio } from "./shared";

/** Players flagged by FPL are only worth a line when this share of managers own them. */
const MIN_OWNERSHIP = 0.05;

const STATUS_LABELS: Record<string, string> = {
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable",
  n: "not eligible",
};

export const disciplineAndAvailability = defineTool({
  name: "discipline_and_availability",
  description:
    "What went wrong this gameweek: gameweek-wide totals of red and yellow cards, penalties missed and saved and " +
    "own goals, then the players involved (for yellow cards, the most-owned players booked), each with the " +
    "player's points and ownership. For the current gameweek " +
    "only, it also lists widely owned players FPL has flagged as injured, suspended or doubtful, with FPL's own " +
    "news text, and whether the gameweek's points are final. Injury and suspension news and the points status " +
    "describe today, so neither is available when looking back at a past gameweek: the result says so. It can't " +
    "say why a card was shown or how an injury happened.",
  input: z.object({ limit: limitInput(10) }),
  run(context, input) {
    const ownership = (p: ContextPlayer) => ownershipRatio(context, p) ?? 0;
    /** The percentage only: the manager count would double the size of every row. */
    const owned = (p: ContextPlayer) => {
      const share = ownershipOf(context, p)?.ownership;
      return share ? { ownership: share } : {};
    };
    const byOwnership = (a: ContextPlayer, b: ContextPlayer) => ownership(b) - ownership(a) || a.id - b.id;

    const withStat = (stat: keyof GameweekLine & ("redCards" | "penaltiesMissed" | "penaltiesSaved" | "ownGoals" | "yellowCards"), limit: number) =>
      context.players
        .filter((p) => p.gw[stat] > 0)
        .sort(byOwnership)
        .slice(0, limit)
        .map((p) => ({ ...label(context, p), [stat]: p.gw[stat], points: p.gw.points, ...owned(p) }));

    const redCards = withStat("redCards", input.limit);
    const penaltiesMissed = withStat("penaltiesMissed", input.limit);
    const penaltiesSaved = withStat("penaltiesSaved", input.limit);
    const ownGoals = withStat("ownGoals", input.limit);
    const booked = context.players.filter((p) => p.gw.yellowCards > 0);

    const availability = context.availability;
    const flagged = availability
      ? context.players
          .filter((p) => {
            const status = availability.get(p.id)?.status;
            return status !== undefined && status !== "a" && ownership(p) >= MIN_OWNERSHIP;
          })
          .sort(byOwnership)
          .slice(0, input.limit)
          .map((p) => {
            const a = availability.get(p.id)!;
            return {
              ...label(context, p),
              status: STATUS_LABELS[a.status] ?? a.status,
              ...(a.news ? { news: a.news } : {}),
              ...(a.chanceOfPlayingNextRound !== null ? { chanceOfPlayingNextRound: `${a.chanceOfPlayingNextRound}%` } : {}),
              ...owned(p),
            };
          })
      : undefined;

    const total = (stat: "redCards" | "yellowCards" | "penaltiesMissed" | "penaltiesSaved" | "ownGoals") =>
      context.players.reduce((sum, p) => sum + p.gw[stat], 0);

    return {
      gameweek: context.gameweek,
      // Gameweek-wide counts, so "four red cards" has a figure to stand on.
      totals: {
        redCards: total("redCards"),
        yellowCards: total("yellowCards"),
        penaltiesMissed: total("penaltiesMissed"),
        penaltiesSaved: total("penaltiesSaved"),
        ownGoals: total("ownGoals"),
      },
      ...(redCards.length ? { redCards } : {}),
      ...(penaltiesMissed.length ? { penaltiesMissed } : {}),
      ...(penaltiesSaved.length ? { penaltiesSaved } : {}),
      ...(ownGoals.length ? { ownGoals } : {}),
      yellowCards: {
        playersBooked: booked.length,
        ...(booked.length ? { mostOwned: withStat("yellowCards", Math.min(input.limit, 3)) } : {}),
      },
      ...(flagged
        ? { availability: flagged, availabilityAsOf: "Flags and news as FPL shows them now, after this gameweek." }
        : {
            availabilityNote:
              "Injury and suspension news is only known for the current gameweek. It is not available when looking back at a past gameweek.",
          }),
      ...(context.pointsStatus
        ? {
            pointsStatus: {
              final: context.pointsStatus.final,
              bonusAdded: context.pointsStatus.days.every((d) => d.bonusAdded),
            },
          }
        : {}),
    };
  },
});
