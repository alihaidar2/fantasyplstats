// The site's main navigation: which pages sit under which header menu, and
// which section a URL belongs to (for the active state). Pure data and
// functions; relative imports, not `@/`, so the Vitest tests can import it.

import { gameweekPath, PATHS } from "./site";

export interface NavLink {
  label: string;
  href: string;
}

export type NavSectionId = "fixtures" | "players" | "teams" | "gameweeks" | "tools" | "recap";

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** A section with one page is a plain link; one with several is a menu. */
  links: readonly NavLink[];
}

export interface NavGameweeks {
  /** The newest gameweek with a page (the current one once it has started); null pre-season. */
  latest: number | null;
  /** The newest gameweek FPL has published a team of the week for; null before any is settled. */
  teamOfTheWeek: number | null;
}

/**
 * The header's sections, in order. The gameweek links depend on the snapshot,
 * so they are passed in (and left out before the season starts).
 */
export function buildNav({ latest, teamOfTheWeek }: NavGameweeks): NavSection[] {
  return [
    {
      id: "fixtures",
      label: "Fixtures",
      links: [
        { label: "Fixture difficulty", href: PATHS.fixtures },
        { label: "Doubles and blanks", href: PATHS.schedule },
      ],
    },
    {
      id: "players",
      label: "Players",
      links: [
        { label: "All players", href: PATHS.players },
        { label: "Injuries", href: PATHS.availability },
        { label: "Price changes", href: PATHS.prices },
        { label: "Value", href: PATHS.value },
        { label: "Set pieces", href: PATHS.setPieces },
        { label: "Template team", href: PATHS.template },
      ],
    },
    { id: "teams", label: "Teams", links: [{ label: "Premier League table", href: PATHS.teams }] },
    {
      id: "gameweeks",
      label: "Gameweeks",
      links: [
        { label: "Live points", href: PATHS.live },
        ...(latest ? [{ label: `Gameweek ${latest} results`, href: gameweekPath(latest) }] : []),
        ...(teamOfTheWeek
          ? [{ label: `Team of the week (GW${teamOfTheWeek})`, href: `${gameweekPath(teamOfTheWeek)}#team-of-the-week` }]
          : []),
        { label: "All gameweeks", href: PATHS.gameweeks },
        { label: "How points work", href: PATHS.points },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      links: [
        { label: "Squad planner", href: PATHS.planner },
        { label: "Compare players", href: PATHS.compare },
        { label: "All tools", href: PATHS.tools },
      ],
    },
    { id: "recap", label: "Recap", links: [{ label: "Gameweek recaps", href: PATHS.recaps }] },
  ];
}

/** "/players/1" -> "/players/1/" (the site's URLs end in "/"; usePathname may not). */
export function normalisePath(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

const SECTION_PREFIXES: readonly [string, NavSectionId][] = [
  [PATHS.fixtures, "fixtures"],
  [PATHS.players, "players"],
  [PATHS.teams, "teams"],
  [PATHS.gameweeks, "gameweeks"],
  ["/matches/", "gameweeks"],
  [PATHS.live, "gameweeks"],
  [PATHS.points, "gameweeks"],
  [PATHS.tools, "tools"],
  [PATHS.recaps, "recap"],
];

/** The header section a page belongs to (player pages are under Players, match pages under Gameweeks). */
export function sectionOf(pathname: string): NavSectionId | null {
  const path = normalisePath(pathname);
  return SECTION_PREFIXES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}

/** The link that is the current page, if any (the first one, when two point at the same page). */
export function currentHref(sections: readonly NavSection[], pathname: string): string | null {
  const path = normalisePath(pathname);
  for (const section of sections) {
    for (const link of section.links) {
      if (link.href.split("#")[0] === path) return link.href;
    }
  }
  return null;
}
