// <head> metadata for the matches and gameweeks pages, built with the site's
// shared pageMetadata so titles, canonicals and Open Graph match other pages.
// (No import from "next" here: the return types come from pageMetadata.)

import type { Snapshot } from "../../fpl";
import { pageMetadata, truncateDescription } from "../../metadata";
import { seasonOf } from "../../recap/context";
import { formatSeason } from "../../recaps";
import type { GameweekSummary } from "./gameweeks";
import type { MatchPageData } from "./match";
import { gameweekPath, MATCHES_PATHS, matchPath } from "./shared";

/** "2026/27", or null if the snapshot can't say which season it is. */
export function seasonLabel(snapshot: Pick<Snapshot, "bootstrap" | "generatedAt">): string | null {
  try {
    return formatSeason(seasonOf(snapshot));
  } catch {
    return null;
  }
}

export const gameweeksMetadata = pageMetadata({
  title: "FPL gameweek stats: average scores, captains and chips",
  description:
    "Every Fantasy Premier League gameweek this season: average and highest scores, most captained, most transferred in, top scorer and chips played.",
  path: MATCHES_PATHS.gameweeks,
});

export const scheduleMetadata = pageMetadata({
  title: "FPL double and blank gameweek planner",
  description:
    "Which Premier League clubs play twice and which don't play in each Fantasy Premier League gameweek still to come, with every club's matches per gameweek.",
  path: MATCHES_PATHS.schedule,
});

const s = (n: number) => (n === 1 ? "" : "s");

export function gameweekMetadata(summary: GameweekSummary, season: string | null) {
  const facts = [
    summary.averageScore !== null ? `average ${summary.averageScore}` : null,
    summary.highestScore !== null ? `highest ${summary.highestScore}` : null,
    summary.topScorer ? `top scorer ${summary.topScorer.name} (${summary.topScorer.points} pt${s(summary.topScorer.points)})` : null,
    summary.mostCaptained ? `most captained ${summary.mostCaptained.name}` : null,
  ].filter(Boolean);
  const what = `FPL${season ? ` ${season}` : ""} Gameweek ${summary.gameweek} stats`;
  return pageMetadata({
    title: `FPL Gameweek ${summary.gameweek} stats, results and team of the week`,
    description: truncateDescription(
      `${what}${facts.length ? `: ${facts.join(", ")}.` : "."} Results, team of the week and chips played.`,
    ),
    path: gameweekPath(summary.gameweek),
  });
}

/** "Arsenal 3–0 Leeds" (or "Arsenal v Leeds" with no score yet). */
export function matchTitle(match: Pick<MatchPageData, "home" | "away">): string {
  const { home, away } = match;
  return home.score !== null && away.score !== null
    ? `${home.team.name} ${home.score}–${away.score} ${away.team.name}`
    : `${home.team.name} v ${away.team.name}`;
}

export function matchMetadata(match: MatchPageData, season: string | null) {
  const status = match.state === "finished" ? null : match.state === "provisional" ? "provisional" : "in progress";
  const when = [match.gameweek ? `GW${match.gameweek}` : null, season, status].filter(Boolean).join(", ");
  return pageMetadata({
    title: `${matchTitle(match)}${when ? ` (${when})` : ""}: FPL match stats`,
    description: truncateDescription(
      `${matchTitle(match)} in FPL${match.gameweek ? ` Gameweek ${match.gameweek}` : ""}${season ? ` (${season})` : ""}: ` +
        "goals, assists, cards, saves, bonus points, BPS and defensive contributions for every player.",
    ),
    path: matchPath(match.id),
    openGraph: { type: "article" },
  });
}

/** For an unknown gameweek or match. dynamicParams = false makes this unreachable in the export, but keep it safe. */
export const matchesNotFoundMetadata = {
  title: "Page not found",
  robots: { index: false },
} as const;
