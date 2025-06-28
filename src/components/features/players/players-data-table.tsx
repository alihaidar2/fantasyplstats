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
import type { Player } from "@/types/players";

interface PlayersDataTableProps {
  players: Player[];
  isLoading: boolean;
  getTeamName: (teamId: number) => string;
  getPositionName: (elementTypeId: number) => string;
}

export function PlayersDataTable({
  players,
  isLoading,
  getTeamName,
  getPositionName,
}: PlayersDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "total_points", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [positionFilter, setPositionFilter] = React.useState<string>("all");
  const [pageSize, setPageSize] = React.useState<number>(10);

  const getPositionColor = (elementTypeId: number) => {
    switch (elementTypeId) {
      case 1:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"; // GKP
      case 2:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"; // DEF
      case 3:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"; // MID
      case 4:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"; // FWD
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getFormColor = (form: string) => {
    const formValue = parseFloat(form);
    if (formValue >= 7) return "text-green-600 dark:text-green-400";
    if (formValue >= 5) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const SortableHeader = ({
    column,
    children,
    className = "",
    style,
  }: {
    column: Column<Player, unknown>;
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

  const columns: ColumnDef<Player>[] = [
    {
      accessorKey: "web_name",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          className="pl-2 pr-18 justify-start min-w-[250px]"
        >
          Player
        </SortableHeader>
      ),
      accessorFn: (row) => `${row.first_name} ${row.second_name}`,
      size: 20,
      cell: ({ row }) => {
        const player = row.original;
        const fullName = `${player.first_name} ${player.second_name}`;
        return (
          <div className="font-medium text-gray-900 dark:text-white truncate pl-2 pr-18 min-w-[250px]">
            {fullName}
          </div>
        );
      },
    },
    {
      accessorKey: "element_type",
      header: ({ column }) => (
        <SortableHeader column={column}>Position</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center">
          <Badge
            className={`text-xs ${getPositionColor(
              row.getValue("element_type") as number
            )}`}
          >
            {getPositionName(row.getValue("element_type") as number)}
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
          {getTeamName(row.getValue("team") as number)}
        </div>
      ),
    },
    {
      accessorKey: "now_cost",
      header: ({ column }) => (
        <SortableHeader column={column}>Price</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-900 dark:text-white">
          £{((row.getValue("now_cost") as number) / 10).toFixed(1)}m
        </div>
      ),
    },
    {
      accessorKey: "total_points",
      header: ({ column }) => (
        <SortableHeader column={column}>Points</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center font-medium text-gray-900 dark:text-white">
          {row.getValue("total_points") as number}
        </div>
      ),
    },
    {
      accessorKey: "points_per_game",
      header: ({ column }) => (
        <SortableHeader column={column}>PPG</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.getValue("points_per_game") as string}
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
          className={`text-center font-medium ${getFormColor(
            row.getValue("form") as string
          )}`}
        >
          {row.getValue("form") as string}
        </div>
      ),
    },
    {
      accessorKey: "selected_by_percent",
      header: ({ column }) => (
        <SortableHeader column={column}>Ownership</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {parseFloat(row.getValue("selected_by_percent") as string).toFixed(1)}
          %
        </div>
      ),
    },
    {
      accessorKey: "goals_scored",
      header: ({ column }) => (
        <SortableHeader column={column}>Goals</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.getValue("goals_scored") as number}
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
          {row.getValue("assists") as number}
        </div>
      ),
    },
    {
      accessorKey: "clean_sheets",
      header: ({ column }) => (
        <SortableHeader column={column}>CS</SortableHeader>
      ),
      size: 8,
      cell: ({ row }) => (
        <div className="text-center text-gray-600 dark:text-gray-400">
          {row.getValue("clean_sheets") as number}
        </div>
      ),
    },
  ];

  const filteredPlayers = React.useMemo(() => {
    if (!positionFilter || positionFilter === "all") return players;
    return players.filter((player) => {
      const position = getPositionName(player.element_type);
      return position.toLowerCase().includes(positionFilter.toLowerCase());
    });
  }, [players, positionFilter, getPositionName]);

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">
              Loading players...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-4 pt-6">
          <Input
            placeholder="Filter players..."
            value={
              (table.getColumn("web_name")?.getFilterValue() as string) ?? ""
            }
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              table.getColumn("web_name")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Goalkeeper">GKP</SelectItem>
              <SelectItem value="Defender">DEF</SelectItem>
              <SelectItem value="Midfielder">MID</SelectItem>
              <SelectItem value="Forward">FWD</SelectItem>
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
