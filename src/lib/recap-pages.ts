// View models for the recap pages, the archive and the gameweek stats box.
// Pure functions of the snapshot and the published recaps; relative imports,
// not `@/`, so the Vitest tests can import this file.

import type { Element, Snapshot } from "./fpl";
import { seasonOf } from "./recap/context";
import {
  adjacentRecaps,
  findRecap,
  formatSeason,
  type PublishedRecap,
} from "./recaps";
import { playerPath } from "./site";

type SnapshotParts = Pick<Snapshot, "bootstrap" | "generatedAt">;

export interface PlayerRef {
  id: number;
  /** FPL's short name ("Haaland"). */
  name: string;
  /** The club's short name ("MCI"). */
  team: string;
  path: string;
}

export interface GameweekStats {
  gameweek: number;
  averageScore: number;
  highestScore: number | null;
  mostCaptained: PlayerRef | null;
  topScorer: (PlayerRef & { points: number }) | null;
  chips: { chip: string; label: string; played: number }[];
}

/** FPL's chip ids in words. An unknown chip keeps its id. */
export const CHIP_LABELS: Record<string, string> = {
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Assistant Manager",
};

/** Looks players up by id and names them as the site does. */
export function playerRefs(bootstrap: Pick<SnapshotParts["bootstrap"], "elements" | "teams">) {
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const ref = (e: Element): PlayerRef => ({
    id: e.id,
    name: e.web_name.trim() || `${e.first_name} ${e.second_name}`.trim(),
    team: teams.get(e.team) ?? "—",
    path: playerPath(e.id),
  });
  return (id: number | null | undefined): PlayerRef | null => {
    const element = id == null ? undefined : elements.get(id);
    return element ? ref(element) : null;
  };
}

/**
 * The stats box for one gameweek, from the snapshot's `events` (not the
 * recap's evidence log). Null when the snapshot is from another season than
 * `season` (its events would describe the wrong gameweek), when it has no
 * such gameweek, or when the gameweek hasn't been played yet. A player FPL no
 * longer lists comes back as null rather than a wrong name.
 */
export function buildGameweekStats(
  snapshot: SnapshotParts,
  season: string,
  gameweek: number,
): GameweekStats | null {
  let snapshotSeason: string;
  try {
    snapshotSeason = seasonOf(snapshot);
  } catch {
    return null;
  }
  if (snapshotSeason !== season) return null;

  const event = snapshot.bootstrap.events.find((e) => e.id === gameweek);
  if (!event) return null;
  const played = event.finished || event.data_checked || event.average_entry_score > 0 || !!event.highest_score;
  if (!played) return null;

  const player = playerRefs(snapshot.bootstrap);
  const top = event.top_element_info;
  const topPlayer = player(top?.id);

  return {
    gameweek,
    averageScore: event.average_entry_score,
    highestScore: event.highest_score,
    mostCaptained: player(event.most_captained),
    topScorer: top && topPlayer ? { ...topPlayer, points: top.points } : null,
    chips: [...event.chip_plays]
      .sort((a, b) => b.num_played - a.num_played)
      .map((c) => ({ chip: c.chip_name, label: CHIP_LABELS[c.chip_name] ?? c.chip_name, played: c.num_played })),
  };
}

/** Who wrote the recap, in words for the note under it. */
export function authorshipNote(model: string): string {
  if (model === "hand-written") {
    return "Written by hand from verified Fantasy Premier League data. Every number was checked automatically against that data, and the recap was reviewed by a person before it was published.";
  }
  return `Written by AI (${model}) from verified Fantasy Premier League data. Every number was checked automatically against that data, and a person reviewed the recap before it was published.`;
}

export interface RecapLink {
  path: string;
  /** "GW3" or "2025/26 GW38" when it's from another season. */
  label: string;
  headline: string;
}

export interface RecapPage {
  recap: PublishedRecap;
  /** "2026/27" */
  seasonLabel: string;
  stats: GameweekStats | null;
  note: string;
  /** The next older recap. */
  previous: RecapLink | null;
  /** The next newer recap. */
  next: RecapLink | null;
}

function linkTo(target: PublishedRecap | null, from: PublishedRecap): RecapLink | null {
  if (!target) return null;
  const label =
    target.season === from.season ? `GW${target.gameweek}` : `${formatSeason(target.season)} GW${target.gameweek}`;
  return { path: target.path, label, headline: target.headline };
}

/** Everything /recap/<season>/gw<N>/ shows, or null if there's no such recap. */
export function buildRecapPage(
  snapshot: SnapshotParts,
  recaps: readonly PublishedRecap[],
  season: string,
  gameweek: number,
): RecapPage | null {
  const recap = findRecap(recaps, season, gameweek);
  if (!recap) return null;
  const { previous, next } = adjacentRecaps(recaps, recap);
  return {
    recap,
    seasonLabel: formatSeason(recap.season),
    stats: buildGameweekStats(snapshot, recap.season, recap.gameweek),
    note: authorshipNote(recap.model),
    previous: linkTo(previous, recap),
    next: linkTo(next, recap),
  };
}

export interface ArchiveSeason {
  season: string;
  label: string;
  recaps: { path: string; gameweek: number; headline: string }[];
}

/** The archive, grouped by season, newest first. Expects newest-first recaps. */
export function buildRecapArchive(recaps: readonly PublishedRecap[]): ArchiveSeason[] {
  const seasons: ArchiveSeason[] = [];
  for (const r of recaps) {
    let group = seasons.at(-1);
    if (group?.season !== r.season) {
      group = { season: r.season, label: formatSeason(r.season), recaps: [] };
      seasons.push(group);
    }
    group.recaps.push({ path: r.path, gameweek: r.gameweek, headline: r.headline });
  }
  return seasons;
}

/**
 * The one route a static export gets while no recap is published: Next.js
 * refuses a dynamic route whose generateStaticParams returns nothing. The page
 * renders the not-found page for it ("gw0" never parses as a gameweek).
 */
export const RECAP_PLACEHOLDER_PARAMS = { season: "none", gameweek: "gw0" } as const;

/** Route params for every recap page. */
export function recapParams(recaps: readonly PublishedRecap[]): { season: string; gameweek: string }[] {
  return recaps.map((r) => ({ season: r.season, gameweek: `gw${r.gameweek}` }));
}
