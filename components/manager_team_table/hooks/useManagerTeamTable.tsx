import { useMemo } from "react";
import { useTable, useSortBy, Column, TableState } from "react-table";
import Player from "@/types/player";

export const useManagerTeamTable = (players: Player[]) => {
  // ✅ Filter out invalid players
  const filteredPlayers = useMemo(
    () => players.filter((player) => player.player_id),
    [players]
  );

  // ✅ Define table columns
  const columns = useMemo<Column<Player>[]>(
    () => [
      {
        Header: "Name",
        accessor: "web_name",
        id: "web_name",
        Cell: ({ value }: { value: string }) => value || "Unknown",
      },
      {
        Header: "Price (M)",
        accessor: "now_cost",
        id: "now_cost",
        Cell: ({ value }: { value: number }) =>
          value ? (value / 10).toFixed(1) : "N/A",
      },
      {
        Header: "Position",
        accessor: "element_type",
        id: "element_type",
      },
      {
        Header: "Goals",
        accessor: "goals_scored",
        id: "goals_scored",
      },
      {
        Header: "Assists",
        accessor: "assists",
        id: "assists",
      },
      {
        Header: "Clean Sheets",
        accessor: "clean_sheets",
        id: "clean_sheets",
      },
      {
        Header: "Points",
        accessor: "event_points",
        id: "event_points",
      },
    ],
    []
  );

  // ✅ Set up React Table
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable(
      {
        columns,
        data: filteredPlayers,
        initialState: {
          sortBy: [
            {
              id: "event_points", // Sort by Points by default
              desc: true,
            },
          ],
        } as Partial<TableState<Player>>,
      },
      useSortBy
    );

  return {
    tableInstance: {
      getTableProps,
      getTableBodyProps,
      headerGroups,
      rows,
      prepareRow,
    },
  };
};
