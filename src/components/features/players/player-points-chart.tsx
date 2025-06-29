import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PlayerElementHistory } from "@/types/players";
import React from "react";

// Define a local TooltipPayload type for Recharts payload entries
interface TooltipPayload {
  color?: string;
  dataKey?: string | number;
  value?: number | string;
}

function ThemedTooltip({
  active,
  payload,
  label,
}: Readonly<{
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
}>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-white rounded shadow px-3 py-2 border border-gray-200 dark:border-gray-700">
      <div className="font-semibold mb-1">Gameweek: {label}</div>
      {payload.map((entry: TooltipPayload) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize">{entry.dataKey}:</span>
          <span className="font-bold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlayerPointsChart({
  history,
}: Readonly<{
  history: PlayerElementHistory[];
}>) {
  const data = history.map((gw) => ({
    gameweek: gw.round,
    points: gw.total_points,
    xg: parseFloat(gw.expected_goals),
    xa: parseFloat(gw.expected_assists),
  }));

  return (
    <div className="rounded-xl bg-white/90 dark:bg-gray-800/80 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-700 pt-5 pb-5 px-3 h-96 flex flex-col">
      <div className="text-lg font-bold text-gray-900 dark:text-white mb-6 px-2">
        Points per Gameweek
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
          >
            <XAxis dataKey="gameweek" stroke="#888" />
            <YAxis />
            <Tooltip content={<ThemedTooltip />} />
            <Line type="monotone" dataKey="points" stroke="#4ade80" dot />
            {/* Optionally add xG/xA lines: */}
            {/* <Line type="monotone" dataKey="xg" stroke="#818cf8" dot={false} /> */}
            {/* <Line type="monotone" dataKey="xa" stroke="#fbbf24" dot={false} /> */}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
