import React, { useEffect, useState } from "react";
import { Fixture } from "../types/Fixture";
import { Team } from "../types/Team";
import dynamic from "next/dynamic";
// If you are using dynamic import
const HeatMap = dynamic<HeatMapProps>(
  () => import("react-heatmap-grid").then((mod) => mod.default || mod.HeatMap),
  { ssr: false }
);

const FixturesHeatmapCustom: React.FC<{ selectedHeatmap: string }> = ({
  selectedHeatmap,
}) => {
  const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
  const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
  const [selectedGameweekRange, setSelectedGameweeks] = useState(3); // Default value
  const [teamFixtureArray, setTeamFixtureArray] = useState<TeamData[]>([]);
  const [sortDirection, setSortDirection] = useState({});
  const [isLoading, setIsLoading] = useState(true); // Initialize with true or false

  useEffect(() => {
    setIsLoading(true);

    fetch("/api/fixtures")
      .then((response) => response.json())
      .then((data) => {
        console.log("Fetched Data:", data); // Log to verify data

        console.log("teams: ", data.teams);
        console.log("fixtures: ", data.fixtures);
        console.log("heatmapAttack: ", data.heatmapAttack);
        console.log("heatmapDefense: ", data.heatmapDefense);
        console.log("heatmapOverall: ", data.heatmapOverall);

        // Set heatmapData based on selectedHeatmap
        // Basically saying use this data for the heatmap
        let heatmapData: HeatmapData;
        switch (selectedHeatmap) {
          case "simple":
            heatmapData = data.heatmapSimple;
            break;
          case "attack":
            heatmapData = data.heatmapAttack;
            break;
          case "defence":
            heatmapData = data.heatmapDefence;
            break;
          case "overall":
            heatmapData = data.heatmapOverall;
            break;
          default:
            heatmapData = data.heatmapAttack; // Or however you want to handle the default case
            break;
        }

        // console.log("heatmapData: ", heatmapData)

        // Create array of objects {team, fixtures, score}
        const teamFixtureArray = Object.entries(heatmapData).map(
          ([teamName, fixtures]) => {
            // Calculate the average score from the entire difficulties array
            const totalDifficulty = fixtures.reduce(
              (sum, fixture) => sum + fixture.difficulty,
              0
            );
            const averageDifficulty =
              fixtures.length > 0 ? totalDifficulty / fixtures.length : 0;

            return {
              teamName: teamName,
              difficulties: fixtures,
              score: averageDifficulty,
            };
          }
        );

        teamFixtureArray.sort((a, b) => b.score - a.score);
        setTeamFixtureArray(teamFixtureArray);

        // Get remaining Gameweeks
        const uniqueGameweeks: number[] = Array.from(
          new Set(data.fixtures.map((fixture) => fixture.event))
        ); // all remaining gws
        setGameweeks(uniqueGameweeks);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error:", error);
        setIsLoading(false); // Error occurred, stop loading
      });
  }, [selectedGameweekRange, selectedHeatmap]);

  // Gameweeks initial population
  const generateGameweekOptions = (): JSX.Element[] => {
    let options: JSX.Element[] = [];
    for (let i = 1; i <= gameweeks.length; i++) {
      options.push(
        <option key={i} value={i}>
          {i} GW{i > 1 ? "s" : ""}
        </option>
      );
    }
    return options;
  };
  // Set selectedGameweeks to new value when changed in dropdown
  const handleGameweekRangeChange = (event) => {
    setSelectedGameweeks(Number(event.target.value));
  };

  // Gets color based on difficulty
  const getDifficultyColor = (difficultyScore) => {
    if (selectedHeatmap === "simple") {
      if (difficultyScore === 0) {
        return "white"; // Special case for no difficulty
      } else if (difficultyScore === 20) {
        return "darkred"; // Easy (1-20)
      } else if (difficultyScore === 40) {
        return "red"; // Fairly Easy (21-40)
      } else if (difficultyScore === 60) {
        return "orange"; // Moderate (41-60)
      } else if (difficultyScore === 80) {
        return "green"; // Hard (61-80)
      }
    }
    if (difficultyScore === 0) {
      return "white"; // Special case for no difficulty
    } else if (difficultyScore <= 20) {
      return "darkred"; // Easy (1-20)
    } else if (difficultyScore <= 40) {
      return "red"; // Fairly Easy (21-40)
    } else if (difficultyScore <= 60) {
      return "orange"; // Moderate (41-60)
    } else if (difficultyScore <= 80) {
      return "olivedrab"; // Hard (61-80)
    } else {
      return "green"; // Very Hard (81-100)
    }
  };

  // Gets difficulty between 0-100
  const calculateDifficulty = (attack, defense) => {
    // Constants
    const MIN_RATIO = 0.76; // Minimum expected ratio
    const MAX_RATIO = 1.32; // Maximum expected ratio (adjust based on your data)

    // Ensure defense is not zero to prevent division by zero
    defense = defense === 0 ? 1 : defense;

    // Calculate the ratio
    let ratio = attack / defense;

    // Linear scaling of the ratio to the 0-100 range
    let scaledScore = ((ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO)) * 100;

    // Clamping the score between 0 and 100
    scaledScore = Math.max(0, Math.min(scaledScore, 100));

    return scaledScore;
  };

  // Sort on a column
  const handleColumnHeaderClick = (columnIndex) => {
    // Determine the current sort direction for the column
    const currentDirection = sortDirection[columnIndex] || "asc"; // Default to ascending
    // Toggle the sort direction
    const newDirection = currentDirection === "asc" ? "desc" : "asc";

    // Clone the current array to avoid mutating the state directly
    const updatedTeamFixtureArray = [...teamFixtureArray].map((team) => {
      // Assume team.difficulties is an array of objects and we're sorting by 'difficulty'
      const newScore = team.difficulties[columnIndex].difficulty;
      return { ...team, score: newScore };
    });

    // Sort the array based on the new scores and the new sort direction
    updatedTeamFixtureArray.sort((a, b) => {
      if (newDirection === "asc") {
        return a.score - b.score;
      } else {
        return b.score - a.score;
      }
    });

    // Update the sort direction state
    setSortDirection({ ...sortDirection, [columnIndex]: newDirection });

    // Set the updated, sorted array to the state
    setTeamFixtureArray(updatedTeamFixtureArray);
  };

  return (
    <div>
      <div>
        <label className="pl-2 underline" htmlFor="gameweek-select">
          Gameweek Range:
        </label>
        <select
          id="gameweek-select"
          value={selectedGameweekRange}
          onChange={handleGameweekRangeChange}
          className="text-sm"
          style={{ backgroundColor: "#E0E6D3" }}
        >
          {generateGameweekOptions()}
        </select>
      </div>
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 z-10 flex pl-10">
          {gameweeks.slice(0, selectedGameweekRange).map((gw, index) => (
            <div
              key={index}
              className="flex-grow text-center cursor-pointer"
              onClick={() => handleColumnHeaderClick(index)}
            >
              {gw}
            </div>
          ))}
        </div>
        <div className="max-w-full overflow-x-auto">
          {isLoading ? (
            <div>Loading...</div> // Show loading indicator
          ) : (
            <div>
              <HeatMap
                xLabels={gameweeks.slice(0, selectedGameweekRange)}
                yLabels={teamFixtureArray.map((team) => team.teamName)}
                data={teamFixtureArray.map((team) =>
                  team.difficulties.map((fixture) => fixture.difficulty)
                )}
                cellStyle={(background, value, min, max, data, x, y) => {
                  const backgroundColor = getDifficultyColor(value);
                  let textColor = "white"; // Default text color
                  if (value === 0) {
                    textColor = "black";
                  }
                  return {
                    background: getDifficultyColor(value),
                    fontSize: "11px",
                    color: textColor,
                    // other styles...
                  };
                }}
                cellRender={(x, y, teamName) => {
                  // Find the team object by teamName
                  const team = teamFixtureArray.find(
                    (t) => t.teamName === teamName
                  );

                  // Check if the team is found and the difficulties array has the expected data
                  if (team && team.difficulties[y - gameweeks[0]]) {
                    const fixture = team.difficulties[y - gameweeks[0]];
                    // Render the cell with the opponent name
                    return <div>{fixture.opponentName}</div>;
                  } else {
                    // Return a default or empty element if no data is found
                    return <div>---</div>;
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FixturesHeatmapCustom;

// INTERFACES

interface SimpleFixture {
  opponentName: string;
  difficulty: number;
}
interface TeamData {
  teamName: string;
  difficulties: SimpleFixture[];
  score: number;
}
// Have to use this HeatMapProps cause Typescript is giving me issues with react-heatmap-grid
// The other option was to go to .js file but nah
interface HeatMapProps {
  xLabels: number[];
  yLabels: string[];
  data: number[][]; // Since you're mapping to cell.difficulty, which is a number
  cellStyle: (
    background: any, // You may want to specify a more specific type
    value: number,
    min: number,
    max: number,
    data: any, // You may want to specify a more specific type
    x: number,
    y: number
  ) => {
    background: string;
    fontSize: string;
    color: string;
  };
  cellRender: (x: number, y: number, team: string) => JSX.Element;
}

interface HeatmapData {
  [teamName: string]: SimpleFixture[];
}
