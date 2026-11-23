import Link from "next/link";
import { Clock, RefreshCw } from "lucide-react";
import { formatUpdatedAt } from "@/lib/fpl";
import { badgeUrl, PATHS, playerPath } from "@/lib/site";
import { refreshCadence } from "@/lib/stats/live";
import { UpdatedAgo } from "./updated-ago";
import { CARD_CLASS, LINK_CLASS } from "@/components/common/styles";

/** The live area's routes. */
export const LIVE_PATHS = {
  live: PATHS.live,
  points: PATHS.points,
} as const;

export const cardClass = CARD_CLASS;

export const linkClass = LINK_CLASS;

export function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-lg font-bold text-gray-900 dark:text-white">
      {children}
    </h2>
  );
}

export function PlayerLink({ id, name, className }: { id: number; name: string; className?: string }) {
  return (
    <Link
      href={playerPath(id)}
      prefetch={false}
      className={className ?? "font-medium text-gray-900 hover:underline dark:text-white"}
    >
      {name}
    </Link>
  );
}

export function TeamBadge({ code, name, size = 20 }: { code: number; name: string; size?: number }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer
    <img
      src={badgeUrl(code)}
      alt=""
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * When the data was fetched, and how often the site refreshes. The page is
 * static, so this is what "live" means here.
 */
export function Freshness({ generatedAt }: { generatedAt: string }) {
  const { matchDayMinutes, otherDayHours } = refreshCadence();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:gap-6 dark:border-emerald-800 dark:bg-emerald-900/30">
      <p className="flex items-center gap-3 text-gray-900 dark:text-white">
        <Clock className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Data as of
          </span>
          <time dateTime={generatedAt} className="text-lg font-bold">
            {formatUpdatedAt(generatedAt)}
          </time>{" "}
          <UpdatedAgo iso={generatedAt} className="text-sm text-gray-600 dark:text-gray-300" />
        </span>
      </p>
      <p className="flex items-start gap-2 text-sm text-gray-700 sm:ml-auto sm:max-w-md dark:text-gray-300">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <span>
          This page is rebuilt from FPL&apos;s data about every {matchDayMinutes} minutes on match days and every{" "}
          {otherDayHours} hours otherwise, so live scores can be up to {matchDayMinutes} minutes behind.
        </span>
      </p>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Points with a sign and a colour: green for gains, red for deductions. */
export function Points({ value, className }: { value: number; className?: string }) {
  const color =
    value > 0 ? "text-green-700 dark:text-green-400" : value < 0 ? "text-red-700 dark:text-red-400" : "text-gray-500 dark:text-gray-400";
  return <span className={`font-semibold tabular-nums ${color} ${className ?? ""}`}>{signed(value)}</span>;
}
