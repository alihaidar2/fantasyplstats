import { sortByDifficulty } from "@/app/lib/tableUtils";
import { TeamFixture, TeamFixtures } from "@/types";
import { useMemo } from "react";
import { useTable, useSortBy, Column } from "react-table";

export const useGameweekTable = (
  data: TeamFixtures[],
  gameweeks: number[],
  selectedRange: number[]
) => {
  // Filter the gameweeks based on selected range
  const filteredGameweeks = useMemo(
    () =>
      gameweeks.filter(
        (gw) => gw >= selectedRange[0] && gw <= selectedRange[1]
      ),
    [gameweeks, selectedRange] // Recalculate when gameweeks or selectedRange changes
  );

  // Columns definition (team name, gameweeks, and average difficulty)
  const columns = useMemo(() => {
    const teamColumn: Column<TeamFixtures>[] = [
      {
        accessor: "short_name",
        Header: "Team",
        Cell: ({ value }: { value: string }) => (
          <span className="px-4 py-2">{value}</span>
        ),
      },
    ];

    // Create gameweek columns dynamically
    const gameweekColumns: Column<TeamFixtures>[] = gameweeks.map((gw) => ({
      Header: `GW${gw}`,
      id: `GW${gw}`,
      accessor: (teamFixture: TeamFixtures) => {
        const fixture = teamFixture.fixtures.find(
          (f: TeamFixture) => f.gameweek === gw
        );
        return fixture
          ? { difficulty: fixture.difficulty, opponent: fixture.opponent }
          : { difficulty: 0, opponent: "-" };
      },
      sortType: sortByDifficulty,
      Cell: ({
        value,
      }: {
        value: { difficulty: number; opponent: string };
      }) => (
        <span className="px-4 py-2">{value ? `${value.opponent}` : "-"}</span>
      ),
    }));

    // Add the average score column
    const averageScoreColumn: Column<TeamFixtures> = {
      Header: "Average",
      accessor: (team: TeamFixtures) => {
        const totalDifficulty = filteredGameweeks.reduce((sum, gw) => {
          const fixture = team.fixtures.find((f) => f.gameweek === gw);
          return sum + (fixture ? fixture.difficulty : 0);
        }, 0);
        return filteredGameweeks.length > 0
          ? totalDifficulty / filteredGameweeks.length
          : 0;
      },
      id: "average_score",
      Cell: ({ value }: { value: number }) => value.toFixed(1),
    };

    return [...teamColumn, averageScoreColumn, ...gameweekColumns];
  }, [gameweeks, selectedRange]);

  // React Table setup
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable(
      {
        columns,
        data,
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
