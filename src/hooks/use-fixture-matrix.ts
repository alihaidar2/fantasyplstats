import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useFixtures } from "@/hooks/use-fixtures";
import { MatrixRow, Cell } from "@/types/fixtures";

export function useFixtureMatrix(currentGW: number = 1) {
  const [range, setRange] = useState<[number, number]>([
    currentGW,
    Math.min(currentGW + 5, 38),
  ]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { data, isLoading, error } = useFixtures();

  const columnVisibility = useMemo(() => {
    const [from, to] = range;
    const vis: Record<string, boolean> = {};
    for (let i = 1; i <= 38; i++) vis[`gw${i}`] = i >= from && i <= to;
    return vis;
  }, [range]);

  function getColumns(range: [number, number]): ColumnDef<MatrixRow>[] {
    const [from, to] = range;
    return [
      {
        accessorKey: "team",
        header: "Team",
        size: 40,
        enableSorting: true,
        cell: (info) => info.getValue<string>(),
      },
      {
        id: "average",
        accessorFn: (row) => {
          let sum = 0,
            count = 0;
          for (let gw = from; gw <= to; gw++) {
            const cell = row[`gw${gw}`];
            if (cell && typeof cell.difficulty === "number") {
              sum += cell.difficulty;
              count++;
            }
          }
          return count ? sum / count : undefined;
        },
        header: "Avg",
        size: 40,
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const dataA = rowA.original;
          let sumA = 0,
            countA = 0;
          for (let gw = from; gw <= to; gw++) {
            const cell = dataA[`gw${gw}`];
            if (cell && typeof cell.difficulty === "number") {
              sumA += cell.difficulty;
              countA++;
            }
          }
          const avgA = countA ? sumA / countA : 0;

          const dataB = rowB.original;
          let sumB = 0,
            countB = 0;
          for (let gw = from; gw <= to; gw++) {
            const cell = dataB[`gw${gw}`];
            if (cell && typeof cell.difficulty === "number") {
              sumB += cell.difficulty;
              countB++;
            }
          }
          const avgB = countB ? sumB / countB : 0;

          return avgA - avgB;
        },
        cell: ({ row }) => {
          const data = row.original;
          let sum = 0,
            count = 0;
          for (let gw = from; gw <= to; gw++) {
            const cell = data[`gw${gw}`];
            if (cell && typeof cell.difficulty === "number") {
              sum += cell.difficulty;
              count++;
            }
          }
          const avg = count ? sum / count : undefined;
          return avg !== undefined ? avg.toFixed(1) : "—";
        },
      },
      ...Array.from({ length: to - from + 1 }, (_, idx) => {
        const gw = from + idx;
        const key = `gw${gw}` as const;
        return {
          id: key,
          accessorKey: key,
          header: String(gw),
          size: 110,
          enableSorting: true,
          sortingFn: (rowA, rowB, columnId) => {
            const a = rowA.getValue(columnId) as Cell;
            const b = rowB.getValue(columnId) as Cell;
            return (a.difficulty ?? 0) - (b.difficulty ?? 0);
          },
          cell: ({ getValue }) => {
            const c = getValue<Cell>();
            return {
              text: c.text,
              difficulty: c.difficulty,
            };
          },
        } as ColumnDef<MatrixRow>;
      }),
    ];
  }

  const columns = useMemo(() => getColumns(range), [range]);

  const table = useReactTable({
    data: data || [],
    columns,
    state: { columnVisibility, sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return {
    range,
    setRange,
    sorting,
    setSorting,
    data,
    isLoading,
    error,
    table,
    columns,
    columnVisibility,
  };
}
