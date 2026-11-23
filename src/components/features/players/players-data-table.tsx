"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  PaginationState,
  SortingState,
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlayerRow } from "@/lib/fpl/transforms";
import { PLAYER_COLUMNS, PLAYER_COLUMN_IDS } from "./players-table-columns";
import { PlayersTableTabs, tabIdFor } from "./players-table-tabs";
import {
  DEFAULT_VIEW,
  PLAYERS_TABLE_VIEWS,
  getView,
  hashForView,
  sortingForView,
  viewFromHash,
  visibilityForView,
  type PlayersTableViewId,
} from "./players-table-views";

const PANEL_ID = "players-table-panel";
const VIEW_CHANGE_EVENT = "players-table-view-change";

function subscribeToView(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(VIEW_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(VIEW_CHANGE_EVENT, onChange);
  };
}

/**
 * The selected view lives in the URL hash (#attack) so a view is linkable.
 * The page is a static export, so the server render (and hydration) use the
 * default view and the hash takes over right after.
 */
function useSelectedView(): [PlayersTableViewId, (view: PlayersTableViewId) => void] {
  const view = React.useSyncExternalStore(
    subscribeToView,
    () => viewFromHash(window.location.hash),
    () => DEFAULT_VIEW,
  );
  const selectView = (next: PlayersTableViewId) => {
    const { pathname, search } = window.location;
    // replaceState doesn't fire hashchange, so announce the change ourselves.
    window.history.replaceState(null, "", `${pathname}${search}${hashForView(next)}`);
    window.dispatchEvent(new Event(VIEW_CHANGE_EVENT));
  };
  return [view, selectView];
}

interface PlayersDataTableProps {
  players: PlayerRow[];
}

export function PlayersDataTable({ players }: PlayersDataTableProps) {
  const [viewId, selectView] = useSelectedView();
  const view = getView(viewId);

  const [sorting, setSorting] = React.useState<SortingState>([{ ...view.defaultSort }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [positionFilter, setPositionFilter] = React.useState<string>("all");

  // On a view change (tab, hash link or the hash read after hydration), keep
  // the sort if its column is still visible, else use the view's default, and
  // go back to the first page. Adjusting state while rendering avoids a
  // render with a sort on a hidden column.
  const [renderedViewId, setRenderedViewId] = React.useState(viewId);
  if (renderedViewId !== viewId) {
    setRenderedViewId(viewId);
    setSorting((current) => sortingForView(current, view));
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  const columnVisibility = React.useMemo(
    () => visibilityForView(view, PLAYER_COLUMN_IDS),
    [view],
  );

  const filteredPlayers = React.useMemo(
    () =>
      positionFilter === "all"
        ? players
        : players.filter((p) => String(p.positionId) === positionFilter),
    [players, positionFilter],
  );

  const table = useReactTable({
    data: filteredPlayers,
    columns: PLAYER_COLUMNS,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const columnsWidth = visibleColumns.reduce((sum, column) => sum + column.getSize(), 0);

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
      <CardHeader>
        <div className="flex flex-col gap-4 pt-6">
          <PlayersTableTabs
            views={PLAYERS_TABLE_VIEWS}
            selected={viewId}
            onSelect={selectView}
            panelId={PANEL_ID}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search by name..."
              aria-label="Search players by name"
              value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                table.getColumn("name")?.setFilterValue(event.target.value)
              }
              className="max-w-sm"
            />
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-32" aria-label="Filter by position">
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
        </div>
      </CardHeader>
      <CardContent>
        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={tabIdFor(viewId)}
          className="rounded-md border"
        >
          {/*
            Fixed layout: every column is exactly its `size` wide, whatever the
            rows on the page, and a trailing spacer column takes any leftover
            width. The table is never narrower than its columns, so on narrow
            screens it scrolls sideways inside the Table component's container.
          */}
          <Table style={{ tableLayout: "fixed", minWidth: columnsWidth }}>
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
              <col />
            </colgroup>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className="overflow-hidden"
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                  <TableHead aria-hidden="true" className="p-0" />
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="overflow-hidden">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                    <TableCell aria-hidden="true" className="p-0" />
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Show</span>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="w-20" aria-label="Players per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-600 dark:text-gray-400">per page</span>
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
