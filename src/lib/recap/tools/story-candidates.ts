import { z } from "zod";
import type { ContextPlayer } from "../context";
import { defineTool } from "./tool";
import {
  BLANK_MAX_POINTS,
  chipRows,
  currentStreak,
  defensiveRecords,
  gameweekOutcome,
  goalsByGameweek,
  label,
  limitInput,
  ownershipRatio,
  roundOf,
  transfersMadeFact,
} from "./shared";

// How the ranking works. Every candidate gets a score of "managers affected"
// times "how surprising", in managers, so stories of different kinds can be
// compared. The weights are judgement calls, kept in one place:
/** Owned by at least this share: a blank or a no-show is felt widely. */
const WIDELY_OWNED = 0.1;
/** Owned by less than this share: a haul is a differential. */
const DIFFERENTIAL_BELOW = 0.05;
const HAUL_POINTS = 10;
const SURPRISE = {
  /** The captain's result is the gameweek's biggest swing either way. */
  captainBlank: 1.3,
  captainHaul: 1.2,
  captainOther: 0.8,
  noShow: 1.0,
  blank: 0.6,
  haul: 0.8,
  /** A run of three gameweeks or more for a widely owned player. */
  run: 0.5,
  redCard: 0.7,
  /** Transfers are counted per transfer, so a bandwagon that fails outweighs its size. */
  boughtAndBlanked: 2.5,
  boughtAndHauled: 2.0,
  bought: 1.0,
  soldAndHauled: 2.5,
  sold: 0.8,
} as const;
/** Stories about nobody's own players (a season high, a low-owned haul) count as reaching this share of all managers. */
const REACH = { topScorer: 0.15, differentialHaul: 0.06, hatTrick: 0.12, penaltySave: 0.05 } as const;

interface Candidate {
  /** Always on the shortlist, whatever its score: the captain, the top scorer and the most-bought player. */
  pinned?: boolean;
  score: number;
  story: string;
  player?: ContextPlayer;
  facts?: Record<string, unknown>;
}

export const storyCandidates = defineTool({
  name: "story_candidates",
  description:
    "A ranked shortlist of this gameweek's candidate stories, biggest first, worked out from the data by how many " +
    "managers each one touched and how surprising it was: the captain's result, widely owned players who hauled, " +
    "blanked or didn't play, the top scorer, low-owned hauls, the most bought and most sold players and what they " +
    "then did, runs of three gameweeks or more, red cards, penalty saves and hat-tricks. Separately it lists every " +
    "season high this gameweek set (chips, transfers, goals, the average score, defensive contributions; the best " +
    "individual score is marked on its player). Each comes with the figures behind " +
    "it. It is a guide to what matters, not the recap: you still choose the stories, check each featured player " +
    "with player_story, and write. The order is a judgement from fixed rules and no figure is given for it.",
  input: z.object({ limit: limitInput(8, 12) }),
  run(context, input) {
    const { gameweek } = context;
    const managers = context.managers.get(gameweek) ?? 0;
    const candidates: Candidate[] = [];
    const add = (score: number, story: string, player?: ContextPlayer, facts?: Record<string, unknown>, pinned = false) =>
      candidates.push({ score, story, player, facts, pinned });

    const owners = (p: ContextPlayer) => roundOf(p, gameweek)?.owners ?? 0;
    const ratio = (p: ContextPlayer) => ownershipRatio(context, p) ?? 0;
    const played = context.players.filter((p) => roundOf(p, gameweek));

    // The captain.
    const captain = context.event.mostCaptainedId === null ? undefined : context.playerById.get(context.event.mostCaptainedId);
    if (captain) {
      const points = captain.gw.points;
      const [surprise, how] =
        points <= BLANK_MAX_POINTS
          ? [SURPRISE.captainBlank, "the most-captained player blanked"]
          : points >= HAUL_POINTS
            ? [SURPRISE.captainHaul, "the most-captained player hauled"]
            : [SURPRISE.captainOther, "the most-captained player's modest return"];
      add(owners(captain) * surprise, how, captain, { captainPoints: points * 2, tripleCaptainPoints: points * 3 }, true);
      if (points === Math.max(0, ...played.map((p) => p.gw.points))) add(0, "the top score of the gameweek", captain, undefined, true);
    }

    // Widely owned players, and the gameweek's best scores.
    const topScore = Math.max(0, ...played.map((p) => p.gw.points));
    for (const p of played) {
      if (p === captain) continue;
      const share = ratio(p);
      if (share >= WIDELY_OWNED) {
        if (p.gw.minutes === 0) add(owners(p) * SURPRISE.noShow, "a widely owned player did not play", p);
        else if (p.gw.points <= BLANK_MAX_POINTS) add(owners(p) * SURPRISE.blank, "a widely owned player blanked", p);
        else if (p.gw.points >= HAUL_POINTS) add(owners(p) * SURPRISE.haul, "a widely owned player hauled", p);
      }
      if (p.gw.points === topScore && topScore > 0) {
        add(Math.max(owners(p) * SURPRISE.haul, managers * REACH.topScorer), "the top score of the gameweek", p, undefined, true);
      } else if (share < DIFFERENTIAL_BELOW && p.gw.points >= HAUL_POINTS) {
        add(managers * REACH.differentialHaul * (p.gw.points / HAUL_POINTS), "a low-owned player hauled", p);
      }
      if (p.gw.redCards > 0 && share >= DIFFERENTIAL_BELOW) add(owners(p) * SURPRISE.redCard, "a red card", p, { redCards: p.gw.redCards });
      if (p.gw.penaltiesSaved > 0) {
        add(owners(p) * SURPRISE.blank + managers * REACH.penaltySave, "a penalty save", p, { penaltiesSaved: p.gw.penaltiesSaved });
      }
      if (p.gw.goals >= 3) add(owners(p) + managers * REACH.hatTrick, "a hat-trick", p);
    }

    // Runs, for players enough managers own (the captain included).
    for (const p of played) {
      if (ratio(p) < DIFFERENTIAL_BELOW) continue;
      const scoring = currentStreak(p, (r) => r.goals > 0);
      const blanking = currentStreak(p, (r) => r.points <= BLANK_MAX_POINTS);
      const absent = currentStreak(p, (r) => r.minutes === 0);
      if (scoring >= 3) add(owners(p) * SURPRISE.run, "a scoring run", p, { gameweeksInARowWithAGoal: scoring });
      if (absent >= 2) add(owners(p) * SURPRISE.noShow, "a run without playing", p, { gameweeksInARowWithoutMinutes: absent });
      else if (blanking >= 3 && ratio(p) >= WIDELY_OWNED) add(owners(p) * SURPRISE.run, "a run of blanks", p, { gameweeksInARowBlanking: blanking });
    }

    // The transfer market: the biggest net move each way.
    if (context.hasTransfers) {
      const moved = played.map((p) => ({ p, balance: roundOf(p, gameweek)!.transfersBalance }));
      const bought = moved.reduce((a, b) => (b.balance > a.balance ? b : a), moved[0]);
      const sold = moved.reduce((a, b) => (b.balance < a.balance ? b : a), moved[0]);
      if (bought && bought.balance > 0) {
        const pts = bought.p.gw.points;
        const [surprise, how] =
          pts <= BLANK_MAX_POINTS
            ? [SURPRISE.boughtAndBlanked, "the most-bought player blanked"]
            : pts >= HAUL_POINTS
              ? [SURPRISE.boughtAndHauled, "the most-bought player hauled"]
              : [SURPRISE.bought, "the most-bought player's return"];
        add(bought.balance * surprise, how, bought.p, { netTransfersIn: bought.balance }, true);
      }
      if (sold && sold.balance < 0) {
        const hauled = sold.p.gw.points >= HAUL_POINTS;
        add(
          -sold.balance * (hauled ? SURPRISE.soldAndHauled : SURPRISE.sold),
          hauled ? "the most-sold player hauled" : "the most-sold player",
          sold.p,
          { netTransfersOut: -sold.balance },
        );
      }
    }

    // Season highs are listed on their own, so the shortlist of players can't crowd them out.
    const seasonHighs: Record<string, unknown>[] = [];
    for (const chip of chipRows(context)) {
      if (chip.mostPlayedInAGameweekSoFar) seasonHighs.push({ seasonHigh: `most ${chip.chip} chips played in a gameweek so far`, ...chip });
    }
    const transfers = transfersMadeFact(context);
    if (transfers?.mostTransfersInAGameweekSoFar) seasonHighs.push({ seasonHigh: "most transfers made before a gameweek so far", ...transfers });
    const goals = goalsByGameweek(context);
    if (goals.mostSoFar) {
      seasonHighs.push({
        seasonHigh: "most goals in a gameweek so far",
        goals: goals.now,
        matchCount: context.matches.length,
        previousHigh: { gameweek: goals.previousHigh!.gameweek, goals: goals.previousHigh!.goals },
      });
    }
    const earlierAverages = context.gameweekScores.filter((g) => g.gameweek < gameweek).map((g) => g.averageScore);
    if (earlierAverages.length > 0 && context.event.averageScore > Math.max(...earlierAverages)) {
      seasonHighs.push({ seasonHigh: "highest average manager score in a gameweek so far", averageScore: context.event.averageScore });
    }
    if (earlierAverages.length > 0 && context.event.averageScore < Math.min(...earlierAverages)) {
      seasonHighs.push({ seasonHigh: "lowest average manager score in a gameweek so far", averageScore: context.event.averageScore });
    }
    const defence = defensiveRecords(context);
    if (defence.bestIndividualSoFar && defence.bestNow) {
      seasonHighs.push({
        seasonHigh: "most defensive contributions by one player in a gameweek so far",
        ...label(context, defence.bestNow.player),
        defensiveContribution: defence.bestNow.defensiveContribution,
        points: defence.bestNow.player.gw.points,
      });
    }
    if (defence.mostSoFar) {
      seasonHighs.push({
        seasonHigh: "most defensive contributions by all players in a gameweek so far",
        defensiveContribution: defence.totalNow,
        previousHigh: defence.previousHigh,
      });
    }
    const bestBefore = Math.max(0, ...context.players.flatMap((p) => p.rounds.filter((r) => r.gameweek < gameweek).map((r) => r.points)));
    const several = context.seasonEvents.length > 1;

    // One entry per player: their biggest story, with the others noted.
    candidates.sort((a, b) => b.score - a.score || (a.player?.id ?? 0) - (b.player?.id ?? 0));
    const merged: (Candidate & { also: string[] })[] = [];
    for (const c of candidates) {
      const existing = c.player ? merged.find((m) => m.player === c.player) : undefined;
      if (existing) {
        if (!existing.also.includes(c.story) && c.story !== existing.story) existing.also.push(c.story);
        existing.facts = { ...c.facts, ...existing.facts };
        existing.pinned ||= c.pinned;
      } else merged.push({ ...c, also: [] });
    }
    // The shortlist: the highest scores, with the pinned stories taking the last places if they missed out.
    const shortlist = merged.slice(0, input.limit);
    for (const c of merged.slice(input.limit).filter((m) => m.pinned)) {
      const last = shortlist.findLastIndex((s) => !s.pinned);
      if (last !== -1) shortlist[last] = c;
    }
    shortlist.sort((a, b) => b.score - a.score || (a.player?.id ?? 0) - (b.player?.id ?? 0));

    return {
      gameweek,
      note:
        "Ranked by managers affected and surprise, biggest first. A guide, not the recap: confirm each story with " +
        "the tool that owns it before writing.",
      candidates: shortlist.map((c) => ({
        story: c.story,
        ...(c.also.length ? { also: c.also } : {}),
        ...(c.player
          ? {
              ...gameweekOutcome(context, c.player),
              ...(several && c.player.gw.points > bestBefore ? { bestIndividualScoreOfTheSeasonSoFar: true } : {}),
            }
          : {}),
        ...c.facts,
      })),
      ...(seasonHighs.length ? { seasonHighs } : several ? { seasonHighsNote: "No season high was set this gameweek." } : {}),
    };
  },
});
