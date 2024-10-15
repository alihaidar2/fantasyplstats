import { useState, useEffect, useMemo } from "react";
import { Column, useTable, useSortBy } from "react-table";

interface Fixture {
  gameweek: number;
  difficulty: number;
  opponent: string;
}

interface TeamData {
  short_name: string;
  fixtures: Fixture[];
}

const sortByDifficulty = (
  rowA: { values: { [x: string]: { difficulty: number } } },
  rowB: { values: { [x: string]: { difficulty: number } } },
  columnId: string | number
) => {
  const difficultyA = rowA.values[columnId]?.difficulty || 0;
  const difficultyB = rowB.values[columnId]?.difficulty || 0;
  return difficultyA - difficultyB;
};

export const useGameweekTable = () => {
  const [data, setData] = useState<TeamData[]>([]);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState<number[]>([
    gameweeks[0],
    gameweeks[3],
  ]);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((res) => res.json())
      .then(({ structuredTeams, gameweeks }) => {
        setData(structuredTeams);
        setGameweeks(gameweeks);
        setSelectedRange([gameweeks[0], gameweeks[3]]);
      })
      .catch((err) => {
        console.error("Error fetching data: ", err);
      });
  }, []);

  // Memoize the filtered gameweeks to prevent unnecessary recalculations
  const filteredGameweeks = useMemo(() => {
    return gameweeks.filter(
      (gwId) => gwId >= selectedRange[0] && gwId <= selectedRange[1]
    );
  }, [gameweeks, selectedRange]);

  console.log("filteredGameweeks: ", filteredGameweeks);

  const columns: Column<TeamData>[] = useMemo(() => {
    const teamColumn: Column<TeamData> = {
      Header: "Team",
      accessor: "short_name",
    };

    const averageScoreColumn: Column<TeamData> = {
      Header: "Average",
      accessor: (team: TeamData) => {
        const totalDifficulty = filteredGameweeks.reduce((sum, gw) => {
          const fixture = team.fixtures.find((f) => f.gameweek === gw);
          return sum + (fixture ? fixture.difficulty : 0);
        }, 0);

        const averageDifficulty =
          filteredGameweeks.length > 0
            ? totalDifficulty / filteredGameweeks.length
            : 0;
        return averageDifficulty;
      },
      id: "average_score",
    };

    const gameweekColumns: Column<TeamData>[] = filteredGameweeks.map(
      (gw: number) => ({
        Header: `GW${gw}`,
        accessor: (team: TeamData) => {
          const fixture = team.fixtures.find((f: Fixture) => f.gameweek === gw);
          return fixture
            ? { difficulty: fixture.difficulty, opponent: fixture.opponent }
            : { difficulty: 0, opponent: "-" };
        },
        id: `GW${gw}`,
        sortType: sortByDifficulty,
      })
    );

    return [teamColumn, ...gameweekColumns, averageScoreColumn];
  }, [filteredGameweeks]);

  const tableInstance = useTable({ columns, data }, useSortBy);
  console.log("tableInstance: ", tableInstance);

  return {
    tableInstance,
    filteredGameweeks,
    selectedRange,
    setSelectedRange,
  };
};
