import { Tooltip } from "@mui/material";
import React from "react";
import { Column, TableState, useSortBy, useTable } from "react-table";

// Define types for the team and fixture data
interface Fixture {
  gameweek: number;
  difficulty: number;
  opponent: string;
}

interface TeamData {
  short_name: string;
  fixtures: Fixture[];
}

interface CustomTooltipContentProps {
  opponent: string;
  difficulty: number;
}

const CustomTooltipContent: React.FC<CustomTooltipContentProps> = ({
  opponent,
  difficulty,
}) => (
  <div className="p-2">
    <p className="font-semibold">{`Opponent: ${opponent}`}</p>
    <p
      className={`mt-1 text-sm ${
        difficulty >= 4 ? "text-red-500" : "text-green-500"
      }`}
    >
      {`Difficulty: ${difficulty}`}
    </p>
  </div>
);

// GAMEWEEK TABLE
export const GameweekTable = ({
  data,
  gameweeks,
  selectedRange,
}: {
  data: TeamData[];
  gameweeks: number[];
  selectedRange: number[];
}) => {
  const columns = React.useMemo(() => {
    const baseColumns: Column<TeamData>[] = [
      {
        accessor: "short_name",
        Header: () => {
          return <span>Team</span>;
        },
        Cell: ({ value }: { value: string }) => {
          return <span className="px-4 py-2">{value}</span>;
        },
      },
    ];

    // Generate gameweek columns based on the selected range
    const filteredGameweeks = gameweeks.filter(
      (gw) => gw >= selectedRange[0] && gw <= selectedRange[1]
    );

    const sortByDifficulty = (
      rowA: { values: { [x: string]: { difficulty: number } } },
      rowB: { values: { [x: string]: { difficulty: number } } },
      columnId: string | number
    ) => {
      const difficultyA = rowA.values[columnId]?.difficulty || 0;
      const difficultyB = rowB.values[columnId]?.difficulty || 0;

      return difficultyA - difficultyB;
    };

    // Create a column for each gameweek
    const gameweekColumns: Column<TeamData>[] = gameweeks.map((gw: number) => ({
      Header: `GW${gw}`, // The gameweek number becomes the column header
      id: `GW${gw}`, // Ensure that each column has a unique id
      accessor: (team: TeamData) => {
        const fixture = team.fixtures.find((f: Fixture) => f.gameweek === gw);
        return fixture
          ? { difficulty: fixture.difficulty, opponent: fixture.opponent }
          : { difficulty: 0, opponent: "-" };
      },
      sortType: sortByDifficulty, // Use the custom sorting function

      Cell: ({
        value,
      }: {
        value: { difficulty: number; opponent: string };
      }) => {
        return value ? (
          <span className="px-4 py-2">{value.opponent}</span>
        ) : (
          <span className="px-4 py-2">-</span>
        );
      },
    }));

    // Add a new column for the average difficulty score based on the selected range
    const averageScoreColumn: Column<TeamData> = {
      Header: "Average",
      accessor: (team: TeamData) => {
        // Calculate the sum of difficulties over the filtered gameweeks
        const totalDifficulty = filteredGameweeks.reduce((sum, gw) => {
          const fixture = team.fixtures.find((f) => f.gameweek === gw);
          return sum + (fixture ? fixture.difficulty : 0);
        }, 0);

        // Calculate the average difficulty
        const averageDifficulty =
          filteredGameweeks.length > 0
            ? totalDifficulty / filteredGameweeks.length
            : 0;
        return averageDifficulty;
      },
      id: "average_score",
      Cell: ({ value }: { value: number }) => {
        return value.toFixed(1);
      },
    };

    // Combine the team name column with the gameweek columns
    return [...baseColumns, averageScoreColumn, ...gameweekColumns];
  }, [gameweeks, selectedRange]);

  const tableInstance = useTable(
    {
      columns,
      data,
      initialState: {
        sortBy: [{ id: "average_score", desc: false }],
      } as Partial<TableState<TeamData>>,
    },
    useSortBy
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    tableInstance;

  // Function to return a color based on difficulty rating
  const getColorForDifficulty = (value: any, columnId?: string) => {
    if (columnId === "average_score") {
      return "bg-gray-200";
    }
    const numDifficulty =
      typeof value === "object" && value !== null
        ? value.difficulty
        : typeof value === "string"
        ? parseInt(value, 10)
        : value;

    if (numDifficulty === 5) return "bg-red-800 text-white"; // Dark Red for very difficult fixtures
    if (numDifficulty === 4) return "bg-red-500"; // Red for difficult fixtures
    if (numDifficulty === 3) return "bg-yellow-300"; // Yellow for moderate fixtures
    if (numDifficulty === 2) return "bg-green-300"; // Green for easy fixtures

    return "bg-gray-200"; // Default color
  };

  // get width for Team and Average
  const getColumnWidthClass = (columnId: string) => {
    if (columnId === "short_name" || columnId === "average_score") {
      return "w-4";
    }
    return "w-auto";
  };

  return (
    <div className=" bg-gray- overflow-x-auto w-full">
      <table
        {...getTableProps()}
        className="min-w-full border-separate border-spacing-1 bg-white"
      >
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column: any) => (
                <th
                  {...column.getHeaderProps(column.getSortByToggleProps())}
                  key={column.id}
                  className={`px-4 py-2 text-left text-sm font-medium text-gray-700 ${getColumnWidthClass(
                    column.id
                  )} rounded-md text-center ${getColorForDifficulty(
                    column.Header,
                    column.id
                  )}`}
                >
                  {/* Render Header */}
                  {column.render("Header")}
                  <span className="ml-1 text-xs text-gray-500">
                    {column.isSorted ? (column.isSortedDesc ? "▼" : "▲") : ""}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map((row) => {
            console.log("row: ", row);

            prepareRow(row);
            return (
              <tr {...row.getRowProps()} key={row.id}>
                {row.cells.map((cell, cellIndex) => {
                  return (
                    <td
                      style={{
                        backgroundColor: getColorForDifficulty(
                          cell.value.difficulty
                        ),
                      }}
                      {...cell.getCellProps()}
                      key={cell.column.id}
                      className={`rounded-full text-center ${getColorForDifficulty(
                        cell.value,
                        cell.column.id
                      )} hover:bg-opacity-50`}
                    >
                      <Tooltip
                        title={
                          <CustomTooltipContent
                            opponent={cell.value.opponent}
                            difficulty={cell.value.difficulty}
                          />
                        }
                        arrow
                        placement="right"
                      >
                        <span>{cell.render("Cell")}</span>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
