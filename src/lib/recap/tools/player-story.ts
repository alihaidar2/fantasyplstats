import { z } from "zod";
import { defineTool } from "./tool";
import {
  BLANK_MAX_POINTS,
  currentStreak,
  formatPercent,
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
    "last five gameweeks week by week (points, minutes, goals, assists, ownership, net transfers), their current " +
    "runs (gameweeks in a row with a goal, with a goal or assist, blanking on 2 points or fewer, or without " +
    "playing a minute) and the trend in ownership and net transfers over those weeks. All figures stop at this gameweek. Use it before writing about " +
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
    const lastFive = player.rounds.slice(-5);

    // A run that this gameweek broke is a story too ("blanked after scoring in four in a row").
    const before = { ...player, rounds: player.rounds.filter((r) => r.gameweek < context.gameweek) };
    const goalsBefore = round ? currentStreak(before, (r) => r.goals > 0) : 0;
    const blanksBefore = round ? currentStreak(before, (r) => r.points <= BLANK_MAX_POINTS) : 0;
    const endedRun =
      round && round.goals === 0 && goalsBefore >= 2
        ? { gameweeksInARowWithAGoalBeforeThisOne: goalsBefore }
        : round && round.points > BLANK_MAX_POINTS && blanksBefore >= 2
          ? { gameweeksInARowBlankingBeforeThisOne: blanksBefore }
          : undefined;

    // Ownership and transfers across the weeks shown, so a slow sell-off or a bandwagon is visible.
    const oldest = lastFive[0];
    const latest = lastFive.at(-1);
    const managersThen = oldest ? context.managers.get(oldest.gameweek) : undefined;
    const managersNow = latest ? context.managers.get(latest.gameweek) : undefined;
    const netOverWeeks = lastFive.filter((r) => r.gameweek > 1).reduce((sum, r) => sum + r.transfersBalance, 0);
    const trend =
      oldest && latest && oldest !== latest
        ? {
            sinceGameweek: oldest.gameweek,
            ...(managersThen && managersNow
              ? { ownershipThen: formatPercent(oldest.owners / managersThen), ownershipNow: formatPercent(latest.owners / managersNow) }
              : {}),
            ...(netOverWeeks >= 0 ? { netTransfersInOverTheseGameweeks: netOverWeeks } : { netTransfersOutOverTheseGameweeks: -netOverWeeks }),
          }
        : undefined;

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
      lastFive: lastFive.map((r) => {
        const managers = context.managers.get(r.gameweek);
        return {
          gameweek: r.gameweek,
          points: r.points,
          minutes: r.minutes,
          goals: r.goals,
          assists: r.assists,
          ownedBy: r.owners,
          ...(managers ? { ownership: formatPercent(r.owners / managers) } : {}),
          ...(r.gameweek > 1 ? (r.transfersBalance >= 0 ? { netTransfersIn: r.transfersBalance } : { netTransfersOut: -r.transfersBalance }) : {}),
        };
      }),
      // Runs end with this gameweek and count only gameweeks their club played. Zero means the run is not live.
      streaks: {
        gameweeksInARowWithAGoal: currentStreak(player, (r) => r.goals > 0),
        gameweeksInARowWithAGoalOrAssist: currentStreak(player, returned),
        gameweeksInARowWithoutAGoalOrAssist: currentStreak(player, (r) => !returned(r)),
        gameweeksInARowBlanking: currentStreak(player, (r) => r.points <= BLANK_MAX_POINTS),
        gameweeksInARowWithMinutes: currentStreak(player, (r) => r.minutes > 0),
        gameweeksInARowWithoutMinutes: currentStreak(player, (r) => r.minutes === 0),
        ...(endedRun ? { runEndedThisGameweek: endedRun } : {}),
      },
      ...(trend ? { trend } : {}),
    };
  },
});
