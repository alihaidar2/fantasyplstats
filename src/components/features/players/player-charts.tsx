"use client";

import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  type AxisDomain,
  type TooltipContentProps,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { PlayerGameweek } from "@/lib/fpl/transforms";
import {
  formatCompact,
  formatNumber,
  formatPrice,
  formatSigned,
} from "./player-format";

// Series colours, set per theme on the wrapper below. Each card uses the
// slots in the same order (validated for colour-blind separation as a set).
const S1 = "var(--viz-s1)";
const S2 = "var(--viz-s2)";
const S3 = "var(--viz-s3)";

const THEME_VARS = [
  "[--viz-s1:#2a78d6] [--viz-s2:#eb6834] [--viz-s3:#1baf7a]",
  "dark:[--viz-s1:#3987e5] dark:[--viz-s2:#d95926] dark:[--viz-s3:#199e70]",
  "[--viz-surface:#ffffff] dark:[--viz-surface:#1f2937]",
  "[--viz-grid:#e5e7eb] dark:[--viz-grid:#374151]",
  "[--viz-axis:#d1d5db] dark:[--viz-axis:#4b5563]",
  "[--viz-ink:#6b7280] dark:[--viz-ink:#9ca3af]",
  "[--viz-cursor:#9ca3af] dark:[--viz-cursor:#6b7280]",
].join(" ");

const CARD_CLASS =
  "rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-4 px-3";

// Fits "£10.0m" and "15.0m" with the tick gap.
const Y_AXIS_WIDTH = 54;
const X_AXIS_HEIGHT = 36;
const TICK = { fill: "var(--viz-ink)", fontSize: 12 };

type Mark = "bar" | "line" | "step" | "area";

interface Series {
  key: Exclude<keyof PlayerGameweek, "gameweek">;
  label: string;
  color: string;
  mark: Mark;
}

interface Panel {
  series: Series[];
  /** Plot height in px (the bottom panel adds the x-axis band). */
  height: number;
  yTickFormatter?: (value: number) => string;
  yDomain?: AxisDomain;
  tickCount?: number;
  allowDecimals?: boolean;
}

interface TooltipLine {
  label: string;
  value: string;
  /** Series colour; omitted for fields that are not plotted. */
  color?: string;
}

interface ChartSpec {
  id: string;
  title: string;
  panels: Panel[];
  tooltip: (row: PlayerGameweek) => TooltipLine[];
  wide?: boolean;
}

/** Price axis: whole £0.5m steps with a little headroom either side. */
const priceDomain: AxisDomain = ([min, max]) => [
  Math.max(0, Math.floor((min - 0.1) * 2) / 2),
  Math.ceil((max + 0.1) * 2) / 2,
];

const CHARTS: ChartSpec[] = [
  {
    id: "points",
    title: "Points per Gameweek",
    wide: true,
    panels: [
      {
        series: [{ key: "points", label: "Points", color: S1, mark: "bar" }],
        height: 180,
        allowDecimals: false,
      },
      {
        series: [
          { key: "xg", label: "Expected goals (xG)", color: S2, mark: "line" },
          { key: "xa", label: "Expected assists (xA)", color: S3, mark: "line" },
        ],
        height: 120,
        yTickFormatter: (v) => formatNumber(v, 1),
      },
    ],
    tooltip: (r) => [
      { label: "Points", value: formatNumber(r.points), color: S1 },
      { label: "Minutes", value: formatNumber(r.minutes) },
      { label: "Goals", value: formatNumber(r.goals) },
      { label: "Assists", value: formatNumber(r.assists) },
      { label: "xG", value: formatNumber(r.xg, 2), color: S2 },
      { label: "xA", value: formatNumber(r.xa, 2), color: S3 },
    ],
  },
  {
    id: "price",
    title: "Price and Ownership",
    panels: [
      {
        series: [{ key: "price", label: "Price", color: S1, mark: "step" }],
        height: 130,
        yTickFormatter: (v) => formatPrice(v),
        yDomain: priceDomain,
        allowDecimals: true,
      },
      {
        series: [{ key: "selected", label: "Owned by (managers)", color: S2, mark: "area" }],
        height: 130,
        yTickFormatter: formatCompact,
        yDomain: [0, "auto"],
        allowDecimals: false,
      },
    ],
    tooltip: (r) => [
      { label: "Price", value: formatPrice(r.price), color: S1 },
      { label: "Owned by", value: formatNumber(r.selected), color: S2 },
      { label: "Net transfers", value: formatSigned(r.transfersBalance) },
    ],
  },
  {
    id: "bonus",
    title: "Bonus, BPS and Defensive Contribution",
    panels: [
      {
        series: [{ key: "bps", label: "Bonus points system (BPS)", color: S1, mark: "bar" }],
        height: 110,
        allowDecimals: false,
      },
      {
        series: [{ key: "bonus", label: "Bonus points", color: S2, mark: "bar" }],
        height: 70,
        // 0–3 a match; a double gameweek can reach 6.
        yDomain: ([, max]) => [0, Math.max(3, max)],
        tickCount: 4,
        allowDecimals: false,
      },
      {
        series: [
          { key: "defensiveContribution", label: "Defensive contribution", color: S3, mark: "bar" },
        ],
        height: 90,
        allowDecimals: false,
      },
    ],
    tooltip: (r) => [
      { label: "BPS", value: formatNumber(r.bps), color: S1 },
      { label: "Bonus", value: formatNumber(r.bonus), color: S2 },
      { label: "Defensive contribution", value: formatNumber(r.defensiveContribution), color: S3 },
    ],
  },
];

function Swatch({ color, mark }: Readonly<{ color: string; mark: Mark }>) {
  return mark === "bar" ? (
    <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: color }} />
  ) : (
    <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
  );
}

function TooltipBox({ gameweek, lines }: Readonly<{ gameweek: number; lines: TooltipLine[] }>) {
  return (
    <div className="min-w-44 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow dark:border-gray-700 dark:bg-gray-800/95 dark:text-white">
      <div className="mb-1 font-semibold">Gameweek {gameweek}</div>
      {lines.map((line) => (
        <div key={line.label} className="flex items-center gap-2">
          {line.color ? (
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: line.color }}
            />
          ) : (
            <span aria-hidden className="inline-block size-2" />
          )}
          <span className="text-gray-600 dark:text-gray-300">{line.label}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Recharts clones this element with the hovered gameweek's payload. */
function PanelTooltip({
  show,
  lines,
  active,
  payload,
}: Readonly<
  Partial<Pick<TooltipContentProps, "active" | "payload">> & {
    show: boolean;
    lines: ChartSpec["tooltip"];
  }
>) {
  if (!show || !active) return null;
  const row = payload?.[0]?.payload as PlayerGameweek | undefined;
  if (!row) return null;
  return <TooltipBox gameweek={row.gameweek} lines={lines(row)} />;
}

function renderSeries(s: Series) {
  switch (s.mark) {
    case "bar":
      return (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label}
          fill={s.color}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      );
    case "area":
      return (
        <Area
          key={s.key}
          dataKey={s.key}
          name={s.label}
          type="monotone"
          stroke={s.color}
          strokeWidth={2}
          fill={s.color}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, fill: s.color, stroke: "var(--viz-surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      );
    default:
      return (
        <Line
          key={s.key}
          dataKey={s.key}
          name={s.label}
          type={s.mark === "step" ? "stepAfter" : "monotone"}
          stroke={s.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, fill: s.color, stroke: "var(--viz-surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      );
  }
}

/**
 * One card: panels stacked over a shared gameweek axis, each with its own
 * y-axis (no dual-axis plots). Hovering any panel moves the cursor in all of
 * them; the tooltip shows in the panel under the pointer.
 */
function ChartCard({ spec, history }: Readonly<{ spec: ChartSpec; history: PlayerGameweek[] }>) {
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const last = spec.panels.length - 1;

  return (
    <section
      aria-labelledby={`chart-${spec.id}`}
      className={`${CARD_CLASS} ${spec.wide ? "lg:col-span-2" : ""}`}
    >
      <h2 id={`chart-${spec.id}`} className="mb-3 px-2 text-lg font-bold tracking-wide text-gray-900 dark:text-white">
        {spec.title}
      </h2>
      <div className="space-y-2">
        {spec.panels.map((panel, i) => {
          const isLast = i === last;
          return (
            <div
              key={panel.series[0].key}
              onMouseEnter={() => setActivePanel(i)}
              onTouchStart={() => setActivePanel(i)}
              onFocus={() => setActivePanel(i)}
            >
              <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-xs text-gray-600 dark:text-gray-300">
                {panel.series.map((s) => (
                  <li key={s.key} className="flex items-center gap-1.5">
                    <Swatch color={s.color} mark={s.mark} />
                    {s.label}
                  </li>
                ))}
              </ul>
              <ComposedChart
                responsive
                width="100%"
                height={panel.height + (isLast ? X_AXIS_HEIGHT : 0)}
                data={history}
                syncId={spec.id}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis
                  dataKey="gameweek"
                  scale="band"
                  hide={!isLast}
                  height={X_AXIS_HEIGHT}
                  tick={TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--viz-axis)" }}
                  interval="preserveStartEnd"
                  minTickGap={6}
                  label={{
                    value: "Gameweek",
                    position: "insideBottom",
                    offset: 0,
                    fill: "var(--viz-ink)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  width={Y_AXIS_WIDTH}
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={panel.yTickFormatter}
                  domain={panel.yDomain}
                  tickCount={panel.tickCount ?? Math.max(3, Math.round(panel.height / 40))}
                  allowDecimals={panel.allowDecimals}
                />
                <Tooltip
                  content={<PanelTooltip show={i === activePanel} lines={spec.tooltip} />}
                  cursor={{ stroke: "var(--viz-cursor)", strokeWidth: 1 }}
                  isAnimationActive={false}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ zIndex: 10 }}
                />
                {panel.series.map(renderSeries)}
              </ComposedChart>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Every gameweek field as a table. Rendered only on request, in the browser. */
function GameweekTable({ history }: Readonly<{ history: PlayerGameweek[] }>) {
  const columns: { label: string; value: (r: PlayerGameweek) => string }[] = [
    { label: "GW", value: (r) => String(r.gameweek) },
    { label: "Pts", value: (r) => formatNumber(r.points) },
    { label: "Mins", value: (r) => formatNumber(r.minutes) },
    { label: "G", value: (r) => formatNumber(r.goals) },
    { label: "A", value: (r) => formatNumber(r.assists) },
    { label: "xG", value: (r) => formatNumber(r.xg, 2) },
    { label: "xA", value: (r) => formatNumber(r.xa, 2) },
    { label: "Bonus", value: (r) => formatNumber(r.bonus) },
    { label: "BPS", value: (r) => formatNumber(r.bps) },
    { label: "DefCon", value: (r) => formatNumber(r.defensiveContribution) },
    { label: "Price", value: (r) => formatPrice(r.price) },
    { label: "Owned by", value: (r) => formatNumber(r.selected) },
    { label: "Net transfers", value: (r) => formatSigned(r.transfersBalance) },
  ];
  return (
    <Table className="tabular-nums">
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.label} className="text-right text-gray-600 first:text-left dark:text-gray-300">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((r) => (
          <TableRow key={r.gameweek}>
            {columns.map((c) => (
              <TableCell key={c.label} className="text-right text-gray-900 first:text-left dark:text-white">
                {c.value(r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * All of the player page's per-gameweek charts. The history is passed to this
 * one client component so it is serialized into the page once.
 */
export default function PlayerCharts({ history }: Readonly<{ history: PlayerGameweek[] }>) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className={`grid grid-cols-1 gap-8 lg:grid-cols-2 ${THEME_VARS}`}>
      {CHARTS.map((spec) => (
        <ChartCard key={spec.id} spec={spec} history={history} />
      ))}
      <section aria-label="Gameweek table" className={`${CARD_CLASS} lg:col-span-2`}>
        <div className="flex items-center justify-between gap-4 px-2">
          <h2 className="text-lg font-bold tracking-wide text-gray-900 dark:text-white">
            Gameweek by Gameweek
          </h2>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showTable}
            onClick={() => setShowTable((v) => !v)}
            className="text-gray-900 dark:text-white"
          >
            {showTable ? "Hide table" : "Show table"}
          </Button>
        </div>
        {showTable && (
          <div className="mt-4">
            <GameweekTable history={history} />
          </div>
        )}
      </section>
    </div>
  );
}
