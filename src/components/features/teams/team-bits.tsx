// Small pieces shared by the league table and the club pages. Server
// components with no hooks: they ship no client JavaScript.

import Link from "next/link";
import { cn, getDifficultyColor } from "@/lib/utils";
import {
  badgeUrl,
  describeForm,
  formatMatchDate,
  type FixtureWeek,
  type Outcome,
} from "@/lib/stats/teams";
import { CARD_CLASS } from "@/components/common/styles";

const OUTCOME_COLOR: { [K in Outcome]: string } = {
  W: "bg-green-600",
  D: "bg-gray-400 dark:bg-gray-500",
  L: "bg-red-600",
};

const outcomeShape =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white";

/** One W/D/L square. The letter carries the meaning, so it doesn't rely on colour. */
export function OutcomeBadge({ outcome, title }: { outcome: Outcome; title?: string }) {
  return (
    <span title={title} className={cn(outcomeShape, OUTCOME_COLOR[outcome])}>
      {outcome}
    </span>
  );
}

// The squares' shared styles sit on the wrapper, so each of the table's 100
// squares carries only its colour.
const formWrap =
  "inline-flex gap-0.5 [&>span]:inline-flex [&>span]:h-5 [&>span]:w-5 [&>span]:items-center [&>span]:justify-center " +
  "[&>span]:rounded [&>span]:text-[11px] [&>span]:font-bold [&>span]:text-white " +
  "[&>span:last-child]:ring-2 [&>span:last-child]:ring-gray-300 [&>span:last-child]:ring-offset-1 " +
  "dark:[&>span:last-child]:ring-gray-600 dark:[&>span:last-child]:ring-offset-gray-900";

/** The last five results, oldest first (the newest is ringed), read out whole to screen readers. */
export function FormGuide({ form }: { form: readonly Outcome[] }) {
  if (form.length === 0) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  const label = describeForm(form);
  return (
    <span role="img" aria-label={label} title={label} className={formWrap}>
      {form.map((o, i) => (
        <span key={i} className={OUTCOME_COLOR[o]}>
          {o}
        </span>
      ))}
    </span>
  );
}

/** The club's badge from the Premier League's CDN (as the player page uses it). Decorative next to the name. */
export function ClubBadge({ code, size = 20, className }: { code: number; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer
    <img
      src={badgeUrl(code)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The next few gameweeks as coloured cells: "—" for a blank, two badges for a double. */
export function FixtureStrip({ weeks }: { weeks: readonly FixtureWeek[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {weeks.map((w) => (
        <li key={w.gameweek} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">GW{w.gameweek}</span>
          {w.fixtures.length === 0 ? (
            <span
              className={cn("rounded px-1.5 py-2 text-center text-xs", getDifficultyColor())}
              title="Blank gameweek: no fixture"
              aria-label="Blank gameweek: no fixture"
            >
              —
            </span>
          ) : (
            <span className="flex gap-1">
              {w.fixtures.map((f) => (
                <span
                  key={f.fixtureId}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center rounded px-1 py-1 text-center",
                    getDifficultyColor(f.difficulty),
                  )}
                  title={`${f.opponent.name} (${f.home ? "home" : "away"}), difficulty ${f.difficulty}`}
                >
                  <span className="text-sm font-semibold">
                    {f.opponent.shortName} ({f.home ? "H" : "A"})
                  </span>
                  <span className="text-[11px] opacity-80">{formatMatchDate(f.kickoff)}</span>
                  <span className="sr-only">, difficulty {f.difficulty}</span>
                </span>
              ))}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A link to one of our club pages. */
export function ClubLink({
  club,
  children,
  className,
}: {
  club: { path: string; name: string };
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={club.path} prefetch={false} className={cn("hover:underline", className)}>
      {children ?? club.name}
    </Link>
  );
}

export const sectionCardClass = `${CARD_CLASS} p-4`;

export function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn(sectionCardClass, "min-w-0")}>
      <h2 id={id} className="text-lg font-bold text-gray-900 dark:text-white">
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}
