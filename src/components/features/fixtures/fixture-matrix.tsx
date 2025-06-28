"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as Slider from "@radix-ui/react-slider";
import { flexRender } from "@tanstack/react-table";
import { getDifficultyColor } from "@/lib/utils";
import { useFixtureMatrix } from "@/hooks/use-fixture-matrix";
import { Spinner } from "@/components/common/Spinner";

export default function FixtureMatrix() {
  const { range, setRange, isLoading, error, table } = useFixtureMatrix();

  // ─── simple helpers to keep range valid ────────────────────
  const handleSlider = (vals: number[]) => {
    // Radix returns an array of numbers; we store ints 1-38
    const [from, to] = vals.map((v) => Math.round(v)) as [number, number];
    setRange([from, to]);
  };

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[12rem]">
        <p className="text-red-600 dark:text-red-400">Error loading fixtures</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        {/* label */}
        <span className="text-sm font-medium shrink-0 text-gray-700 dark:text-gray-300">
          Showing&nbsp;GW&nbsp;{range[0]}&nbsp;–&nbsp;{range[1]}
        </span>

        {/* slider grows to fill the rest */}
        <div className="flex-grow min-w-0">
          <Slider.Root
            className="radix-slider w-full"
            min={1}
            max={38}
            step={1}
            value={range}
            onValueChange={handleSlider}
          >
            <Slider.Track className="radix-slider-track">
              <Slider.Range className="radix-slider-range" />
            </Slider.Track>
            <Slider.Thumb className="radix-slider-thumb" />
            <Slider.Thumb className="radix-slider-thumb" />
          </Slider.Root>
        </div>
      </div>

      {/* ── fixture table ─────────────────────────────────── */}
      {isLoading ? (
        <Card className="border-2 border-gray-200 bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
          <CardContent className="p-8">
            <Spinner />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-x-auto flex-1 min-h-0 flex flex-col dark:bg-gray-900">
          <CardContent className="p-4 flex-1 flex flex-col min-h-0">
            <table className="table-fixed border-separate border-spacing-x-1 border-spacing-y-1 text-xs min-w-max flex-1 w-full">
              <colgroup>
                <col style={{ width: "4rem" }} />
                <col style={{ width: "4rem" }} />
                {(() => {
                  const [from, to] = range;
                  return Array.from({ length: to - from + 1 }, (_, idx) => (
                    <col key={from + idx} style={{ minWidth: "10rem" }} />
                  ));
                })()}
              </colgroup>
              <thead className="sticky top-0">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h, i) => (
                      <th
                        key={h.id}
                        className={`p-0 align-middle text-center bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200
                          ${
                            i === 0
                              ? "sticky left-0 z-10 dark:border-gray-700 bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              : ""
                          }
                          ${
                            i === 1
                              ? "sticky left-[4rem] z-10 dark:border-gray-700 bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              : ""
                          }
                        `}
                      >
                        {i < 2 ? (
                          <Badge
                            variant="secondary"
                            className="w-16 h-8 flex items-center justify-center text-base p-0 dark:bg-gray-800 dark:text-gray-200"
                          >
                            <button
                              type="button"
                              className="w-full h-full flex items-center justify-center font-semibold focus:outline-none bg-transparent border-none p-0 dark:text-gray-200"
                              onClick={() =>
                                h.column.toggleSorting(
                                  h.column.getIsSorted() === "asc"
                                )
                              }
                              tabIndex={0}
                            >
                              {flexRender(
                                h.column.columnDef.header,
                                h.getContext()
                              )}
                              <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                                {h.column.getIsSorted() === "asc"
                                  ? "▲"
                                  : h.column.getIsSorted() === "desc"
                                  ? "▼"
                                  : ""}
                              </span>
                            </button>
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="flex-1 w-full min-w-[10rem] h-8 flex items-center justify-center text-base p-0 dark:bg-gray-800 dark:text-gray-200"
                          >
                            <button
                              type="button"
                              className="w-full h-full flex items-center justify-center font-semibold focus:outline-none bg-transparent border-none p-0 dark:text-gray-200"
                              onClick={() =>
                                h.column.toggleSorting(
                                  h.column.getIsSorted() === "asc"
                                )
                              }
                              tabIndex={0}
                            >
                              {flexRender(
                                h.column.columnDef.header,
                                h.getContext()
                              )}
                              <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                                {h.column.getIsSorted() === "asc"
                                  ? "▲"
                                  : h.column.getIsSorted() === "desc"
                                  ? "▼"
                                  : ""}
                              </span>
                            </button>
                          </Badge>
                        )}
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
                        className={`p-0 align-middle text-center bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200
                          ${
                            i === 0
                              ? "sticky left-0 z-10 dark:border-gray-700 bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              : ""
                          }
                          ${
                            i === 1
                              ? "sticky left-[4rem] z-10 dark:border-gray-700 bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              : ""
                          }
                        `}
                      >
                        {i < 2 ? (
                          <Badge
                            variant="secondary"
                            className="w-16 h-8 flex items-center justify-center text-base dark:bg-gray-800 dark:text-gray-200"
                          >
                            {flexRender(
                              c.column.columnDef.cell,
                              c.getContext()
                            )}
                          </Badge>
                        ) : (
                          <div className="flex-1 w-full min-w-0 flex">
                            {(() => {
                              const cellValue = c.getValue() as {
                                text: string;
                                difficulty?: number;
                              };
                              return (
                                <Badge
                                  className={`flex-1 w-full min-w-[10rem] h-8 flex items-center justify-center text-base ${getDifficultyColor(
                                    cellValue.difficulty
                                  )}`}
                                >
                                  {cellValue.text}
                                </Badge>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
