import React, { useEffect, useState } from 'react';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';
import dynamic from 'next/dynamic';
// If you are using dynamic import
const HeatMap = dynamic<HeatMapProps>(
    () => import('react-heatmap-grid').then(mod => mod.default || mod.HeatMap),
    { ssr: false, }
);

const FixturesHeatmapCustom: React.FC<{ selectedHeatmap: string }> = ({ selectedHeatmap }) => {
    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
    const [selectedGameweekRange, setSelectedGameweeks] = useState(3); // Default value
    const [teamFixtureArray, setTeamFixtureArray] = useState<TeamData[]>([]);
    const [sortDirection, setSortDirection] = useState({});
    const [isLoading, setIsLoading] = useState(true); // Initialize with true or false




    useEffect(() => {
        setIsLoading(true);

        fetch('/api/fixtures')
            .then(response => response.json())
            .then(data => {

                console.log("Fetched Data:", data); // Log to verify data

                console.log("teams: ", data.teams)
                console.log("fixtures: ", data.fixtures)
                // Gets heatmap data as 2D array
                const heatmapData = getHeatmapData(data.teams, data.fixtures, selectedGameweekRange);
                console.log("heatmapData: ", heatmapData)

                // Create array of objects {team, fixtures, score}
                const teamFixtureArray = data.teams.reduce((acc, team, index) => {
                    // Slice the difficulties array to include only elements up to selectedGameweekRange
                    const relevantDifficulties = heatmapData[index].slice(0, selectedGameweekRange);

                    // Calculate the average score from the sliced difficulties
                    const score = relevantDifficulties.reduce((sum, val) => sum + val.difficulty, 0) / relevantDifficulties.length;

                    // Create an object with the team name, full difficulties, and the calculated score
                    acc.push({
                        teamName: team.short_name,
                        difficulties: heatmapData[index],
                        score: score
                    });

                    return acc;
                }, []);
                teamFixtureArray.sort((a, b) => b.score - a.score);
                setTeamFixtureArray(teamFixtureArray);

                // Get remaining Gameweeks
                const uniqueGameweeks: number[] = Array.from(new Set(data.fixtures.map(fixture => fixture.event))); // all remaining gws
                setGameweeks(uniqueGameweeks);
                setIsLoading(false);


                console.log("teamFixtureArray: ", teamFixtureArray)
            })
            .catch(error => {
                console.error('Error:', error);
                setIsLoading(false); // Error occurred, stop loading
            });
    }, [selectedGameweekRange, selectedHeatmap]);


    // Gameweeks initial population
    const generateGameweekOptions = (): JSX.Element[] => {
        let options: JSX.Element[] = [];
        for (let i = 1; i <= gameweeks.length; i++) {
            options.push(<option key={i} value={i}>{i} GW{i > 1 ? 's' : ''}</option>);
        }
        return options;
    };
    // Set selectedGameweeks to new value when changed in dropdown
    const handleGameweekRangeChange = (event) => {
        setSelectedGameweeks(Number(event.target.value));
    };

    function getHeatmapData(teams: Team[], fixtures: Fixture[], totalGameWeeks: number) {
        const teamsOpponentsAndDifficulties: { [teamName: string]: SimpleFixture[] } = {};

        // Initialize each team with placeholders for each game week
        teams.forEach(team => {
            teamsOpponentsAndDifficulties[team.short_name] = Array.from({ length: totalGameWeeks }, () => ({
                opponentName: 'BGW',
                difficulty: 0
            }));
        });

        // Process each actual fixture
        fixtures.forEach(fixture => {
            const gameWeekIndex = gameweeks.indexOf(fixture.event);

            if (gameWeekIndex === -1 || gameWeekIndex >= totalGameWeeks) {
                // Skip processing this fixture if it's not in the selected range
                return;
            }

            const homeTeam = teams.find(t => t.team_id === fixture.team_h);
            const awayTeam = teams.find(t => t.team_id === fixture.team_a);

            if (homeTeam && awayTeam) {
                let difficultyForHome = 0;
                let difficultyForAway = 0;

                // Calculate difficulties based on selected heatmap
                if (selectedHeatmap == 'attack') {
                    difficultyForHome = calculateDifficulty(homeTeam.strength_attack_home, awayTeam.strength_defence_away);
                    difficultyForAway = calculateDifficulty(awayTeam.strength_attack_away, homeTeam.strength_defence_home);
                } else if (selectedHeatmap == 'defense') {
                    difficultyForHome = calculateDifficulty(homeTeam.strength_defence_home, awayTeam.strength_attack_away);
                    difficultyForAway = calculateDifficulty(awayTeam.strength_defence_away, homeTeam.strength_attack_home);
                } else if (selectedHeatmap == 'overall') {
                    difficultyForHome = calculateDifficulty(homeTeam.strength_overall_home, awayTeam.strength_overall_away);
                    difficultyForAway = calculateDifficulty(awayTeam.strength_overall_away, homeTeam.strength_overall_home);
                }

                // Update the fixture for the home and away teams for the specific game week
                teamsOpponentsAndDifficulties[homeTeam.short_name][gameWeekIndex] = {
                    opponentName: awayTeam.short_name,
                    difficulty: difficultyForHome
                };
                teamsOpponentsAndDifficulties[awayTeam.short_name][gameWeekIndex] = {
                    opponentName: homeTeam.short_name,
                    difficulty: difficultyForAway
                };
            }
        });

        // Return the processed data
        return Object.values(teamsOpponentsAndDifficulties).map(teamFixtures => teamFixtures);
    }

    // Gets color based on difficulty
    const getDifficultyColor = (difficultyScore) => {
        if (difficultyScore === 0) {
            return 'white'; // Handle undefined scores
        } else if (difficultyScore <= 27) {
            return 'darkred';        // Very Hard (76-100)
        } else if (difficultyScore <= 45) {
            return 'red'; // Hard (51-75)
        } else if (difficultyScore <= 63) {
            return 'orange'; // Moderate (26-50)
        } else {
            return 'green'; // Easy (0-25)
        }
    };

    // Gets difficulty between 0-100
    const calculateDifficulty = (attack, defense) => {
        // Constants
        const MIN_RATIO = 0.76;   // Minimum expected ratio
        const MAX_RATIO = 1.32;  // Maximum expected ratio (adjust based on your data)

        // Ensure defense is not zero to prevent division by zero
        defense = defense === 0 ? 1 : defense;

        // Calculate the ratio
        let ratio = attack / defense;

        // Linear scaling of the ratio to the 0-100 range
        let scaledScore = (ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO) * 100;

        // Clamping the score between 0 and 100
        scaledScore = Math.max(0, Math.min(scaledScore, 100));

        return scaledScore;
    };

    // Sort on a column
    const handleColumnHeaderClick = (columnIndex) => {
        // Determine the current sort direction for the column
        const currentDirection = sortDirection[columnIndex] || 'asc'; // Default to ascending
        // Toggle the sort direction
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';

        // Clone the current array to avoid mutating the state directly
        const updatedTeamFixtureArray = [...teamFixtureArray].map(team => {
            // Assume team.difficulties is an array of objects and we're sorting by 'difficulty'
            const newScore = team.difficulties[columnIndex].difficulty;
            return { ...team, score: newScore };
        });

        // Sort the array based on the new scores and the new sort direction
        updatedTeamFixtureArray.sort((a, b) => {
            if (newDirection === 'asc') {
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
                <label
                    className='pl-2 underline' htmlFor="gameweek-select">Gameweek Range:</label>
                <select id="gameweek-select" value={selectedGameweekRange} onChange={handleGameweekRangeChange} className='text-sm' style={{ backgroundColor: '#E0E6D3' }}>
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
                        >{gw}
                        </div>
                    ))}
                </div>
                <div className='max-w-full overflow-x-auto'>
                    {isLoading ? (
                        <div>Loading...</div> // Show loading indicator
                    ) : (
                        <div>
                            <HeatMap
                                xLabels={gameweeks.slice(0, selectedGameweekRange)}
                                yLabels={teamFixtureArray.map(team => team.teamName)}
                                data={teamFixtureArray.map(team => team.difficulties.map(fixture => fixture.difficulty))}
                                cellStyle={(background, value, min, max, data, x, y) => {
                                    const backgroundColor = getDifficultyColor(value);
                                    let textColor = 'white'; // Default text color
                                    if (value === 0) {
                                        textColor = 'black';
                                    }
                                    return {
                                        background: getDifficultyColor(value),
                                        fontSize: '11px',
                                        color: textColor,
                                        // other styles...
                                    };
                                }}
                                cellRender={(x, y, teamName) => {
                                    // Find the team object by teamName
                                    const team = teamFixtureArray.find(t => t.teamName === teamName);

                                    // Check if the team is found and the difficulties array has the expected data
                                    if (team && team.difficulties[y - gameweeks[0]]) {
                                        const fixture = team.difficulties[y - gameweeks[0]];
                                        // Render the cell with the opponent name
                                        return (
                                            <div>
                                                {fixture.opponentName}
                                            </div>
                                        );
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
    cellRender: (
        x: number,
        y: number,
        team: string
    ) => JSX.Element;
}
