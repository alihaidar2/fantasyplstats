import { z } from "zod";
import { defineTool } from "./tool";
import { CHIP_NAMES, kickoffDay, label, matchFact, matchesOf, ownershipOf } from "./shared";

export const gameweekSummary = defineTool({
  name: "gameweek_summary",
  description:
    "The gameweek at a glance: every result with its scorers, the average and highest manager scores, the top " +
    "scorer, the most-captained and most-transferred-in players and how they did, chips played, the Dream Team, " +
    "how many matches were played and how many goals they had, and which clubs had two matches or none. Start " +
    "here, then call captaincy and transfer_story for the full captaincy and transfer picture. Gameweek 1 has no transfers, so it has no " +
    "most-transferred-in player. Whether points are final is only known for the current gameweek.",
  input: z.object({}),
  run(context) {
    const withPoints = (playerId: number | null) => {
      const player = playerId === null ? undefined : context.playerById.get(playerId);
      return player
        ? { ...label(context, player), points: player.gw.points, ...ownershipOf(context, player) }
        : undefined;
    };

    const matches = context.matches.map((match) => {
      const scorers = (match.stats.goals_scored ?? []).map((s) => ({
        ...label(context, context.playerById.get(s.playerId)!),
        goals: s.value,
      }));
      const ownGoals = (match.stats.own_goals ?? []).map((s) => ({
        ...label(context, context.playerById.get(s.playerId)!),
        ownGoals: s.value,
      }));
      return {
        ...matchFact(context, match),
        day: kickoffDay(match.kickoff),
        ...(match.finished ? {} : { note: "Not finished." }),
        ...(scorers.length ? { scorers } : {}),
        ...(ownGoals.length ? { ownGoals } : {}),
      };
    });

    const fixtureCount = (teamId: number) => matchesOf(context, teamId).length;
    const double = context.teams.filter((t) => fixtureCount(t.id) > 1).map((t) => t.name);
    const blank = context.teams.filter((t) => fixtureCount(t.id) === 0).map((t) => t.name);

    const status = context.pointsStatus
      ? { pointsFinal: context.pointsStatus.final && context.event.dataChecked }
      : context.isLatest
        ? { pointsFinal: context.event.finished && context.event.dataChecked }
        : { note: "A past gameweek: its points are final." };

    return {
      gameweek: context.gameweek,
      season: context.season,
      status,
      managers: {
        averageScore: context.event.averageScore,
        ...(context.event.highestScore !== null ? { highestScore: context.event.highestScore } : {}),
        ...(context.managers.has(context.gameweek) ? { ranked: context.managers.get(context.gameweek) } : {}),
      },
      matches,
      matchCount: context.matches.length,
      goals: context.matches.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0),
      ...(double.length ? { doubleGameweek: double } : {}),
      ...(blank.length ? { blankGameweek: blank } : {}),
      topScorer: withPoints(context.event.topScorer?.playerId ?? null),
      mostCaptained: withPoints(context.event.mostCaptainedId),
      ...(context.hasTransfers
        ? { mostTransferredIn: withPoints(context.event.mostTransferredInId) }
        : { transfersNote: "Gameweek 1 has no transfers, so there is no most-transferred-in player." }),
      chips: context.event.chipPlays.map((c) => ({ chip: CHIP_NAMES[c.chip] ?? c.chip, played: c.played })),
      dreamTeam: context.dreamTeam.map((d) => ({
        ...label(context, context.playerById.get(d.playerId)!),
        points: d.points,
      })),
    };
  },
});
