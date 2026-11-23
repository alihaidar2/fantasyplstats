"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { SeasonPoint } from "@/lib/stats/matches/gameweeks";

// The player charts' palette (validated for colour-blind separation, light and dark).
const THEME_VARS = [
  "[--viz-s1:#2a78d6] [--viz-s2:#eb6834]",
  "dark:[--viz-s1:#3987e5] dark:[--viz-s2:#d95926]",
  "[--viz-surface:#ffffff] dark:[--viz-surface:#1f2937]",
  "[--viz-grid:#e5e7eb] dark:[--viz-grid:#374151]",
  "[--viz-axis:#d1d5db] dark:[--viz-axis:#4b5563]",
  "[--viz-ink:#6b7280] dark:[--viz-ink:#9ca3af]",
  "[--viz-cursor:#9ca3af] dark:[--viz-cursor:#6b7280]",
].join(" ");

const SERIES = [
  { key: "highest", label: "Highest score", color: "var(--viz-s2)" },
  { key: "average", label: "Average score", color: "var(--viz-s1)" },
] as const;

const TICK = { fill: "var(--viz-ink)", fontSize: 12 };

function ChartTooltip({ active, payload }: Partial<Pick<TooltipContentProps, "active" | "payload">>) {
  const row = payload?.[0]?.payload as SeasonPoint | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-40 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow dark:border-gray-700 dark:bg-gray-800/95 dark:text-white">
      <div className="mb-1 font-semibold">Gameweek {row.gameweek}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
          <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{row[s.key]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Average and highest FPL score per gameweek. The same numbers are in the
 * table below it, which is the chart's text alternative.
 */
export default function SeasonChart({ data }: Readonly<{ data: SeasonPoint[] }>) {
  return (
    <div className={THEME_VARS} role="img" aria-label="Line chart of the average and highest FPL score per gameweek. The table below has the same numbers.">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-xs text-gray-600 dark:text-gray-300" aria-hidden>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <LineChart responsive width="100%" height={220} data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis
          dataKey="gameweek"
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--viz-axis)" }}
          interval="preserveStartEnd"
          minTickGap={8}
          height={36}
          label={{ value: "Gameweek", position: "insideBottom", offset: 0, fill: "var(--viz-ink)", fontSize: 12 }}
        />
        <YAxis width={44} tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, "auto"]} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: "var(--viz-cursor)", strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            dot={data.length <= 12 ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: s.color, stroke: "var(--viz-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </div>
  );
}
