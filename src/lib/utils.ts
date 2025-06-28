import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { MatrixRow, Cell, Team, Fixture } from "@/types/fixtures";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDifficultyColor(difficulty?: number) {
  switch (difficulty) {
    case 1:
      return "bg-green-800 text-white hover:bg-green-700 transition-colors";
    case 2:
      return "bg-green-300 text-gray-900 dark:bg-green-600 dark:text-white hover:bg-green-200 dark:hover:bg-green-500 transition-colors";
    case 3:
      return "bg-neutral-300 text-gray-900 dark:bg-gray-600 dark:text-white hover:bg-neutral-200 dark:hover:bg-gray-500 transition-colors";
    case 4:
      return "bg-red-300 text-gray-900 dark:bg-red-600 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors";
    case 5:
      return "bg-red-800 text-white hover:bg-red-700 transition-colors";
    default:
      return "bg-gray-300 text-gray-600 italic dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors";
  }
}

export function buildFixtureMatrix(
  teams: Team[],
  fixtures: Fixture[]
): MatrixRow[] {
  const GW_MAX = 38;
  const name = Object.fromEntries(
    teams.map((t) => [t.id, t.short_name])
  ) as Record<number, string>;

  const blankRow = (): Cell[] =>
    Array.from({ length: GW_MAX }, () => ({ text: "—", blank: true }));

  const grid: Record<number, Cell[]> = {};
  teams.forEach((t) => (grid[t.id] = blankRow()));

  const merge = (p: Cell, txt: string, difficulty?: number): Cell =>
    p.blank
      ? { text: txt, blank: false, difficulty }
      : { text: `${p.text}, ${txt}`, blank: false, difficulty };

  for (const fx of fixtures) {
    const col = fx.event - 1;
    if (col < 0 || col >= GW_MAX) continue;

    grid[fx.team_h][col] = merge(
      grid[fx.team_h][col],
      `${name[fx.team_a]} (H)`,
      fx.team_h_difficulty
    );
    grid[fx.team_a][col] = merge(
      grid[fx.team_a][col],
      `${name[fx.team_h]} (A)`,
      fx.team_a_difficulty
    );
  }

  return teams
    .slice()
    .sort((a, b) => a.short_name.localeCompare(b.short_name))
    .map((team) => {
      const row: MatrixRow = { team: team.short_name } as MatrixRow;
      grid[team.id].forEach((cell, idx) => {
        row[`gw${idx + 1}` as const] = cell;
      });
      return row;
    });
}
