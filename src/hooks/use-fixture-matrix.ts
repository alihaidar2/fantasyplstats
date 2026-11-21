import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import {
  averageDifficulty,
  weekSortValue,
  type FixtureMatrix,
  type MatrixFixture,
  type MatrixRow,
} from "@/lib/fpl/transforms";

export type { MatrixFixture };

function getColumns([from, to]: [number, number]): ColumnDef<MatrixRow>[] {
  return [
    {
      id: "team",
      accessorKey: "team",
      header: "Team",
      enableSorting: true,
    },
    {
      id: "average",
      // Blank-only ranges sort as hardest, after every real average.
      accessorFn: (row) => averageDifficulty(row, from, to) ?? 6,
      header: "Avg",
      enableSorting: true,
      cell: ({ row }) => averageDifficulty(row.original, from, to)?.toFixed(1) ?? "—",
    },
    ...Array.from({ length: to - from + 1 }, (_, idx): ColumnDef<MatrixRow> => {
      const gw = from + idx;
      return {
        id: `gw${gw}`,
        accessorFn: (row) => row.weeks[gw - 1] ?? [],
        header: String(gw),
        enableSorting: true,
        sortingFn: (a, b, columnId) =>
          weekSortValue(a.getValue<MatrixFixture[]>(columnId)) -
          weekSortValue(b.getValue<MatrixFixture[]>(columnId)),
      };
    }),
  ];
}

export function useFixtureMatrix(matrix: FixtureMatrix) {
  const [range, setRange] = useState<[number, number]>(matrix.defaultRange);
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => getColumns(range), [range]);

  const table = useReactTable({
    data: matrix.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return { range, setRange, table };
}
