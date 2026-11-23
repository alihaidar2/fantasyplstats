import { z } from "zod";
import { defineTool } from "./tool";
import {
  currentStreak,
  formatPrice,
  formatPriceChange,
  label,
  matchFact,
  ownershipOf,
  playerInput,
  resolvePlayer,
  roundOf,
  seasonTotals,
} from "./shared";

export const playerStory = defineTool({
  name: "player_story",
  description:
    "Everything about one player's gameweek, with season context: where each point came from in each match, " +
    "price and ownership at the deadline, the season so far (totals, rank in their position, best score), their " +
    "last five gameweeks, and current streaks. All figures stop at this gameweek. Use it before writing about " +
    "any player. Gameweek 1 has no transfer or price-change figures.",
  input: z.object({ player: playerInput }),
  run(context, input) {
    const player = resolvePlayer(context, input.player);
    const gw = player.gw;
    const round = roundOf(player, context.gameweek);
    const previous = player.rounds.filter((r) => r.gameweek < context.gameweek).at(-1);
    const first = player.rounds[0];
    const totals = seasonTotals(player);

    const matches = gw.breakdown.map((part) => {
      const match = context.matches.find((m) => m.fixtureId === part.fixtureId);
      return {
        ...(match ? matchFact(context, match) : {}),
        pointsFrom: part.lines.map((l) => ({ stat: l.stat, value: l.value, points: l.points })),
      };
    });

    const samePosition = context.players.filter((p) => p.position === player.position);
    const rankInPosition = 1 + samePosition.filter((p) => seasonTotals(p).points > totals.points).length;
    const best = player.rounds.reduce<{ gameweek: number; points: number } | undefined>(
      (top, r) => (!top || r.points > top.points ? { gameweek: r.gameweek, points: r.points } : top),
      undefined,
    );
    const returned = (r: { goals: number; assists: number }) => r.goals + r.assists > 0;

    return {
      ...label(context, player),
      fullName: player.fullName,
      thisGameweek: {
        ...(round ? {} : { note: "Their club had no match this gameweek." }),
        points: gw.points,
        minutes: gw.minutes,
        goals: gw.goals,
        assists: gw.assists,
        bonus: gw.bonus,
        bps: gw.bps,
        ...(gw.cleanSheets ? { cleanSheets: gw.cleanSheets } : {}),
        ...(gw.saves ? { saves: gw.saves } : {}),
        ...(gw.yellowCards ? { yellowCards: gw.yellowCards } : {}),
        ...(gw.redCards ? { redCards: gw.redCards } : {}),
        ...(gw.ownGoals ? { ownGoals: gw.ownGoals } : {}),
        ...(gw.penaltiesMissed ? { penaltiesMissed: gw.penaltiesMissed } : {}),
        ...(gw.penaltiesSaved ? { penaltiesSaved: gw.penaltiesSaved } : {}),
        defensiveContribution: gw.defensiveContribution,
        xG: gw.xG,
        xA: gw.xA,
        inDreamTeam: gw.inDreamTeam,
        ...(matches.length ? { matches } : {}),
      },
      ...(round
        ? {
            price: formatPrice(round.price),
            ...(previous && context.hasTransfers
              ? { priceChangeSinceLastGameweek: formatPriceChange(round.price - previous.price) }
              : {}),
            ...(first && first !== round ? { priceChangeSinceFirstGameweek: formatPriceChange(round.price - first.price) } : {}),
            ...ownershipOf(context, player),
            ...(context.hasTransfers ? { netTransfersIn: round.transfersBalance } : {}),
          }
        : {}),
      season: {
        points: totals.points,
        rankInPosition,
        gameweeksPlayed: totals.gameweeksPlayed,
        minutes: totals.minutes,
        goals: totals.goals,
        assists: totals.assists,
        bonus: totals.bonus,
        defensiveContribution: totals.defensiveContribution,
        xG: totals.xG,
        xA: totals.xA,
        ...(best ? { bestScore: best.points, bestScoreGameweek: best.gameweek } : {}),
        thisIsTheirBestScore: Boolean(round && best && round.points === best.points && player.rounds.length > 1),
      },
      lastFive: player.rounds.slice(-5).map((r) => ({
        gameweek: r.gameweek,
        points: r.points,
        minutes: r.minutes,
        goals: r.goals,
        assists: r.assists,
      })),
      streaks: {
        gameweeksInARowWithAGoalOrAssist: currentStreak(player, returned),
        gameweeksInARowWithoutAGoalOrAssist: currentStreak(player, (r) => !returned(r)),
        gameweeksInARowWithMinutes: currentStreak(player, (r) => r.minutes > 0),
      },
    };
  },
});
