import { POSITION_IDS, type PositionId, type RuleCell, type RuleRow } from "@/lib/stats/live-points";
import { cn } from "@/lib/utils";

const POSITION_LABELS: Record<PositionId, { short: string; long: string }> = {
  1: { short: "GKP", long: "Goalkeeper" },
  2: { short: "DEF", long: "Defender" },
  3: { short: "MID", long: "Midfielder" },
  4: { short: "FWD", long: "Forward" },
};

function cellColor(cell: RuleCell): string {
  switch (cell.rule.kind) {
    case "unseen":
    case "conflict":
    case "every-ambiguous":
      return "text-gray-400 dark:text-gray-500";
    case "none-yet":
      return "text-gray-600 dark:text-gray-400";
    case "per":
    case "every":
      return cell.rule.points > 0
        ? "text-green-700 dark:text-green-400"
        : cell.rule.points < 0
          ? "text-red-700 dark:text-red-400"
          : "text-gray-600 dark:text-gray-400";
    case "step":
      return "text-green-700 dark:text-green-400";
  }
}

function seenText(cell: RuleCell): string | null {
  if (cell.seen === 0) return null;
  const inferred = cell.sources.length === 1 && cell.sources[0] === "season";
  return `${cell.seen.toLocaleString("en-GB")}×${inferred ? ", inferred" : ""}`;
}

/** The rules table: one row per action, one column per position. */
export function PointsTable({ rows }: { rows: RuleRow[] }) {
  return (
    <div className="relative w-full overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">
          Points per action and position, worked out from the points FPL awarded. Each cell also says how many times
          the action was seen.
        </caption>
        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <tr>
            <th scope="col" className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-semibold dark:bg-gray-900">
              Action
            </th>
            {POSITION_IDS.map((p) => (
              <th key={p} scope="col" className="px-3 py-2 text-center font-semibold">
                <abbr title={POSITION_LABELS[p].long} className="no-underline">
                  {POSITION_LABELS[p].short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <tr key={row.action}>
              <th
                scope="row"
                className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
              >
                {row.label}
              </th>
              {POSITION_IDS.map((p) => {
                const cell = row.cells[p];
                const seen = seenText(cell);
                return (
                  <td key={p} className="px-3 py-2 text-center align-top" title={cell.detail}>
                    <span className={cn("block font-semibold tabular-nums", cellColor(cell))}>{cell.text}</span>
                    {seen && <span className="block text-[11px] text-gray-500 dark:text-gray-400">{seen}</span>}
                    <span className="sr-only">{cell.detail}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
