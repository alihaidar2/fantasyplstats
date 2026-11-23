import { cn, getDifficultyColor } from "@/lib/utils";
import type { MatrixFixture } from "@/lib/fpl/transforms";

/** "ARS (H)": the fixture matrix's label, shortened to fit a small chip. */
const label = (f: MatrixFixture) => `${f.opponent} ${f.home ? "H" : "A"}`;

const describe = (gw: number, week: readonly MatrixFixture[]) =>
  week.length === 0
    ? `GW${gw}: no fixture`
    : `GW${gw}: ${week.map((f) => `${f.opponent} (${f.home ? "home" : "away"}), difficulty ${f.difficulty}`).join("; ")}`;

/**
 * A team's next fixtures as small chips in the fixture matrix's difficulty
 * colours: a dash for a blank gameweek, two stacked chips for a double.
 */
export function FixtureRun({
  gameweeks,
  fixtures,
  className,
  vertical = false,
}: Readonly<{
  gameweeks: readonly number[];
  fixtures: readonly MatrixFixture[][];
  className?: string;
  /** One gameweek per line, labelled, for narrow table columns. */
  vertical?: boolean;
}>) {
  if (gameweeks.length === 0) return null;
  return (
    <ol className={cn("flex gap-0.5", vertical && "flex-col", className)} aria-label="Next fixtures">
      {gameweeks.map((gw, i) => {
        const week = fixtures[i] ?? [];
        const chips = (
          <div className="flex w-11 shrink-0 flex-col gap-px">
            {week.length === 0 ? (
              <span
                aria-hidden
                className={cn("flex h-6 items-center justify-center rounded text-[11px]", getDifficultyColor())}
              >
                —
              </span>
            ) : (
              week.map((f, j) => (
                <span
                  key={j}
                  aria-hidden
                  className={cn(
                    "flex items-center justify-center rounded font-medium leading-none",
                    week.length > 1 ? "h-[11px] text-[9px]" : "h-6 text-[11px]",
                    getDifficultyColor(f.difficulty),
                  )}
                >
                  {label(f)}
                </span>
              ))
            )}
          </div>
        );
        if (vertical) {
          return (
            <li key={gw} className="flex items-center gap-1.5" title={describe(gw, week)}>
              <span className="sr-only">{describe(gw, week)}</span>
              <span aria-hidden className="w-9 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                GW{gw}
              </span>
              {chips}
            </li>
          );
        }
        return (
          <li key={gw} className="shrink-0" title={describe(gw, week)}>
            <span className="sr-only">{describe(gw, week)}</span>
            {chips}
          </li>
        );
      })}
    </ol>
  );
}

/** Column headings ("GW4", "GW5", …) lined up with FixtureRun's chips. */
export function FixtureRunHeader({
  gameweeks,
  className,
}: Readonly<{ gameweeks: readonly number[]; className?: string }>) {
  return (
    <div aria-hidden className={cn("flex gap-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400", className)}>
      {gameweeks.map((gw) => (
        <span key={gw} className="w-11 shrink-0 text-center">
          GW{gw}
        </span>
      ))}
    </div>
  );
}
