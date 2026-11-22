"use client";

import * as React from "react";
import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { PlayerRow } from "@/lib/fpl/transforms";
import { getFormColor, getPositionColor } from "@/hooks/use-player-utils";
import Link from "next/link";

interface PlayersDataTableProps {
  players: PlayerRow[];
}

export function PlayersDataTable({ players }: PlayersDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "totalPoints", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [positionFilter, setPositionFilter] = React.useState<string>("all");
  const [pageSize, setPageSize] = React.useState<number>(10);

  const SortableHeader = ({
    column,
    children,
    className = "",
    style,
  }: {
    column: Column<PlayerRow, unknown>;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className={`h-auto p-0 font-normal w-full justify-center ${className}`}
      style={style}
    >
      {children}
      {column.getIsSorted() === "asc" ? (
        <ChevronUp className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === "desc" ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );

  const columns: ColumnDef<PlayerRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          className="pl-2 pr-18 justify-start min-w-[250px]"
        >
          Player
        </SortableHeader>
      ),
      size: 20,
      cell: ({ row }) => {
        const player = row.original;
        return (
          <Link href={`/players/${player.id}`} className="block">
            <div className="font-medium text-gray-900 dark:text-white truncate pl-2 pr-18 min-w-[250px] hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors">
              {player.name}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: "position",
      header: ({ column }) => (
        <SortableHeader column={column}>Position</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center">
          <Badge className={`text-xs ${getPositionColor(row.original.positionId)}`}>
            {row.original.position}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "team",
      header: ({ column }) => (
        <SortableHeader column={column}>Team</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.team}
        </div>
      ),
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <SortableHeader column={column}>Price</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-900 dark:text-white">
          £{row.original.price.toFixed(1)}m
        </div>
      ),
    },
    {
      accessorKey: "totalPoints",
      header: ({ column }) => (
        <SortableHeader column={column}>Points</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center font-medium text-gray-900 dark:text-white">
          {row.original.totalPoints}
        </div>
      ),
    },
    {
      accessorKey: "pointsPerGame",
      header: ({ column }) => (
        <SortableHeader column={column}>PPG</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.pointsPerGame.toFixed(1)}
        </div>
      ),
    },
    {
      accessorKey: "form",
      header: ({ column }) => (
        <SortableHeader column={column}>Form</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div
          className={`text-center font-medium ${getFormColor(row.original.form)}`}
        >
          {row.original.form.toFixed(1)}
        </div>
      ),
    },
    {
      accessorKey: "selectedByPercent",
      header: ({ column }) => (
        <SortableHeader column={column}>Ownership</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.selectedByPercent.toFixed(1)}%
        </div>
      ),
    },
    {
      accessorKey: "goals",
      header: ({ column }) => (
        <SortableHeader column={column}>Goals</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.goals}
        </div>
      ),
    },
    {
      accessorKey: "assists",
      header: ({ column }) => (
        <SortableHeader column={column}>Assists</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.assists}
        </div>
      ),
    },
    {
      accessorKey: "cleanSheets",
      header: ({ column }) => (
        <SortableHeader column={column}>CS</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.original.cleanSheets}
        </div>
      ),
    },
  ];

  const filteredPlayers = React.useMemo(
    () =>
      positionFilter === "all"
        ? players
        : players.filter((p) => String(p.positionId) === positionFilter),
    [players, positionFilter]
  );

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-4 pt-6">
          <Input
            placeholder="Filter players..."
            value={
              (table.getColumn("name")?.getFilterValue() as string) ?? ""
            }
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="1">GKP</SelectItem>
              <SelectItem value="2">DEF</SelectItem>
              <SelectItem value="3">MID</SelectItem>
              <SelectItem value="4">FWD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        style={{
                          width:
                            header.column.getSize() === 20
                              ? "10%"
                              : header.column.getSize() === 8
                              ? "4%"
                              : "1.5%",
                          minWidth:
                            header.column.getSize() === 20
                              ? "75px"
                              : header.column.getSize() === 8
                              ? "40px"
                              : "15px",
                          maxWidth:
                            header.column.getSize() === 20
                              ? "10%"
                              : header.column.getSize() === 8
                              ? "4%"
                              : "1.5%",
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          width:
                            cell.column.getSize() === 20
                              ? "10%"
                              : cell.column.getSize() === 8
                              ? "4%"
                              : "1.5%",
                          minWidth:
                            cell.column.getSize() === 20
                              ? "75px"
                              : cell.column.getSize() === 8
                              ? "40px"
                              : "15px",
                          maxWidth:
                            cell.column.getSize() === 20
                              ? "10%"
                              : cell.column.getSize() === 8
                              ? "4%"
                              : "1.5%",
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Show
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              per page
            </span>
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
