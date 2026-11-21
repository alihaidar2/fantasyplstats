"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as Slider from "@radix-ui/react-slider";
import { flexRender, type Header } from "@tanstack/react-table";
import { getDifficultyColor } from "@/lib/utils";
import { useFixtureMatrix, type MatrixFixture } from "@/hooks/use-fixture-matrix";
import type { FixtureMatrix as FixtureMatrixData, MatrixRow } from "@/lib/fpl/transforms";

const stickyCell = (i: number) =>
  i === 0
    ? "sticky left-0 z-10 dark:border-gray-700"
    : i === 1
      ? "sticky left-[4rem] z-10 dark:border-gray-700"
      : "";

function SortButton({ header }: { header: Header<MatrixRow, unknown> }) {
  const sorted = header.column.getIsSorted();
  return (
    <button
      type="button"
      className="w-full h-full flex items-center justify-center font-semibold focus:outline-none bg-transparent border-none p-0 dark:text-gray-200"
      onClick={() => header.column.toggleSorting(sorted === "asc")}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
      </span>
    </button>
  );
}

function WeekCell({ fixtures }: { fixtures: MatrixFixture[] }) {
  if (fixtures.length === 0) {
    return (
      <Badge className={`w-full min-w-[10rem] h-8 flex items-center justify-center text-base ${getDifficultyColor()}`}>
        —
      </Badge>
    );
  }
  // A double gameweek shows each fixture with its own difficulty.
  return (
    <div className="flex w-full min-w-[10rem] gap-1">
      {fixtures.map((f, i) => (
        <Badge
          key={i}
          title={`Difficulty ${f.difficulty}`}
          className={`flex-1 min-w-0 h-8 flex items-center justify-center ${
            fixtures.length > 1 ? "text-xs px-1" : "text-base"
          } ${getDifficultyColor(f.difficulty)}`}
        >
          {f.opponent} ({f.home ? "H" : "A"})
        </Badge>
      ))}
    </div>
  );
}

export default function FixtureMatrix({ matrix }: { matrix: FixtureMatrixData }) {
  const { range, setRange, table } = useFixtureMatrix(matrix);

  const handleSlider = (vals: number[]) => {
    const [from, to] = vals.map((v) => Math.round(v)) as [number, number];
    setRange([from, to]);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <span className="text-sm font-medium shrink-0 text-gray-700 dark:text-gray-300">
          Showing&nbsp;GW&nbsp;{range[0]}&nbsp;–&nbsp;{range[1]}
        </span>

        <div className="flex-grow min-w-0">
          <Slider.Root
            className="radix-slider w-full"
            min={1}
            max={matrix.gameweeks}
            step={1}
            value={range}
            onValueChange={handleSlider}
            aria-label="Gameweek range"
          >
            <Slider.Track className="radix-slider-track">
              <Slider.Range className="radix-slider-range" />
            </Slider.Track>
            <Slider.Thumb className="radix-slider-thumb" aria-label="First gameweek" />
            <Slider.Thumb className="radix-slider-thumb" aria-label="Last gameweek" />
          </Slider.Root>
        </div>
      </div>

      <Card className="overflow-x-auto flex-1 min-h-0 flex flex-col dark:bg-gray-900 border-green-200 dark:border-green-900">
        <CardContent className="p-4 flex-1 flex flex-col min-h-0">
          <table className="table-fixed border-separate border-spacing-x-1 border-spacing-y-1 text-xs min-w-max flex-1 w-full">
            <colgroup>
              <col style={{ width: "4rem" }} />
              <col style={{ width: "4rem" }} />
              {Array.from({ length: range[1] - range[0] + 1 }, (_, idx) => (
                <col key={range[0] + idx} style={{ width: "10rem" }} />
              ))}
            </colgroup>
            <thead className="sticky top-0">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h, i) => (
                    <th
                      key={h.id}
                      className={`p-0 align-middle text-center bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200 ${stickyCell(i)}`}
                    >
                      <Badge
                        variant="secondary"
                        className={`${
                          i < 2 ? "w-16" : "w-full min-w-[10rem]"
                        } h-8 flex items-center justify-center text-base p-0 dark:bg-gray-800 dark:text-gray-200`}
                      >
                        <SortButton header={h} />
                      </Badge>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id}>
                  {r.getVisibleCells().map((c, i) => (
                    <td
                      key={c.id}
                      className={`p-0 align-middle text-center bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200 ${stickyCell(i)}`}
                    >
                      {i < 2 ? (
                        <Badge
                          variant="secondary"
                          className="w-16 h-8 flex items-center justify-center text-base dark:bg-gray-800 dark:text-gray-200"
                        >
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </Badge>
                      ) : (
                        <WeekCell fixtures={c.getValue<MatrixFixture[]>()} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
