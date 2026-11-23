import { Star } from "lucide-react";
import type { FormationView } from "@/lib/stats/matches";

// Player cards take their styles from the pitch (descendant selectors) to keep
// the markup of each gameweek page small.
const PITCH =
  "flex flex-col-reverse gap-3 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 p-3 sm:gap-4 sm:p-4 dark:from-emerald-900 dark:to-emerald-950 " +
  "[&_ul]:flex [&_ul]:justify-center [&_ul]:gap-1.5 sm:[&_ul]:gap-3 [&_li]:min-w-0 [&_li]:max-w-24 [&_li]:flex-1 [&_li]:basis-0 " +
  "[&_a]:flex [&_a]:flex-col [&_a]:items-center [&_a]:rounded-lg [&_a]:bg-white/95 [&_a]:px-1 [&_a]:py-1.5 [&_a]:text-center [&_a]:shadow-sm [&_a:hover]:bg-white dark:[&_a]:bg-gray-900/90 dark:[&_a:hover]:bg-gray-900 " +
  "[&_.n]:flex [&_.n]:max-w-full [&_.n]:items-center [&_.n]:gap-0.5 [&_.n]:text-xs [&_.n]:font-semibold [&_.n]:text-gray-900 sm:[&_.n]:text-sm dark:[&_.n]:text-white " +
  "[&_.t]:text-[11px] [&_.t]:text-gray-500 dark:[&_.t]:text-gray-400 " +
  "[&_.p]:mt-0.5 [&_.p]:rounded [&_.p]:bg-emerald-700 [&_.p]:px-1.5 [&_.p]:text-xs [&_.p]:font-bold [&_.p]:tabular-nums [&_.p]:text-white dark:[&_.p]:bg-emerald-600";

/**
 * FPL's team of the week laid out as a formation on a pitch, goalkeeper at
 * the bottom (flex-col-reverse: the markup and reading order start with the
 * goalkeeper). Each line is a list under its own visually hidden heading.
 */
export default function TeamOfTheWeek({ team }: { team: FormationView }) {
  const hasTop = team.lines.some((l) => l.players.some((p) => p.top));
  return (
    <div>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Formation {team.formation} · {team.totalPoints} points in total
      </p>
      <div className={PITCH}>
        {team.lines.map((line) => (
          <div key={line.line}>
            <h3 className="sr-only">{line.label}</h3>
            <ul>
              {line.players.map((p) => (
                <li key={p.id}>
                  <a href={p.path}>
                    <span className="n">
                      <span className="truncate">{p.name}</span>
                      {p.top && (
                        <>
                          <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                          <span className="sr-only">(player of the week)</span>
                        </>
                      )}
                    </span>
                    <span className="t">{p.team}</span>
                    <span className="p">
                      {p.points}
                      <span className="sr-only"> points</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {hasTop && (
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden />
          FPL&apos;s player of the week
        </p>
      )}
    </div>
  );
}
