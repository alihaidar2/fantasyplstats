import React, { useEffect, useState } from 'react';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';
import dynamic from 'next/dynamic';
// import  HeatMap from 'react-heatmap-grid'
// If you are using dynamic import
const HeatMap = dynamic<HeatMapProps>(
    () => import('react-heatmap-grid').then(mod => mod.default || mod.HeatMap),
    {
        ssr: false,
        loading: () => <p>Loading...</p>
    }
);
const MIN_VALUE = 1040;
const MAX_VALUE = 1370;

const FixturesHeatmapCustom: React.FC<{ selectedHeatmap: string }> = ({ selectedHeatmap }) => {

    console.log("selectedHeatmap: ", selectedHeatmap)

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
    const [selectedGameweekRange, setSelectedGameweeks] = useState(5); // Default value
    const [teamFixtureDictionary, setTeamFixtureDictionary] = useState<{ [teamName: string]: SimpleFixture[] }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [teamFixtureArray, setTeamFixtureArray] = useState<TeamData[]>([]);
    const [sortDirection, setSortDirection] = useState({});


    useEffect(() => {
        setIsLoading(true);
        fetch('/api/fixtures')
            .then(response => response.json())
            .then(data => {
                console.log("teams: ", data.teams)
                console.log("fixtures: ", data.fixtures)
                // setTeams(data.teams);

                // Gets heatmap data as 2D array
                const heatmapData = getHeatmapData(data.teams, data.fixtures);

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

                console.log("teamFixtureArray: ", teamFixtureArray)
            })
            .catch(error => console.error('Error:', error));
    }, [selectedGameweekRange, selectedHeatmap]);


    // At run time, get options for dropdown
    const generateGameweekOptions = (): JSX.Element[] => {
        let options: JSX.Element[] = [];
        for (let i = 1; i <= gameweeks.length; i++) {
            options.push(<option key={i} value={i}>{i} GW{i > 1 ? 's' : ''}</option>);
        }
        return options;
    };
    // Set selectedGameweeks to new value
    const handleGameweekRangeChange = (event) => {
        setSelectedGameweeks(Number(event.target.value)); // this sets it but it doesnt reload with the proper data
    };
    // function to get heatmap data in useEffect()
    function getHeatmapData(teams: Team[], fixtures: Fixture[]) {
        // Initialize an object to hold all teams with their opponents and difficulties
        const teamsOpponentsAndDifficulties: { [teamName: string]: SimpleFixture[] } = {};

        // Populate the object with team names as keys
        teams.forEach(team => {
            teamsOpponentsAndDifficulties[team.short_name] = [];
        });

        fixtures.forEach(fixture => {
            // ... (existing code to get home and away team)

            const homeTeam = teams.find(t => t.team_id === fixture.team_h);
            const awayTeam = teams.find(t => t.team_id === fixture.team_a);

            if (homeTeam && awayTeam) {
                const homeAttackStrength = homeTeam.strength_attack_home;
                const awayDefenseStrength = awayTeam.strength_defence_away;
                const awayAttackStrength = awayTeam.strength_attack_away;
                const homeDefenseStrength = homeTeam.strength_defence_home;
                let difficultyForHome;
                let difficultyForAway;


                if (selectedHeatmap == 'attack') {
                    difficultyForHome = calculateDifficulty(homeAttackStrength, awayDefenseStrength);
                } 
                else if (selectedHeatmap == 'defense') {
                    difficultyForHome = calculateDifficulty(homeDefenseStrength, awayAttackStrength);
                }
                

                if (selectedHeatmap == 'attack') {
                    difficultyForAway = calculateDifficulty(awayAttackStrength, homeDefenseStrength);
                } 
                else if (selectedHeatmap == 'defense') {
                    difficultyForHome = calculateDifficulty(awayDefenseStrength, homeAttackStrength);
                }
                
                teamsOpponentsAndDifficulties[homeTeam.short_name].push({
                    opponentName: awayTeam.short_name,
                    difficulty: difficultyForHome,
                });

                teamsOpponentsAndDifficulties[awayTeam.short_name].push({
                    opponentName: homeTeam.short_name,
                    difficulty: difficultyForAway
                });
            }
        });
        // });

        // Creates 2D array of fixtures, need to create a dictionary to map keys to this from teams
        return Object.values(teamsOpponentsAndDifficulties).map(
            (teamFixtures: SimpleFixture[]) => teamFixtures
        );

    }
    const getDifficultyColor = (difficultyScore) => {
        console.log("difficultyScore: ", difficultyScore )
        if (difficultyScore === undefined) {
            return 'white';    // Easiest section
        }if (difficultyScore <= 63.63) {
            return 'darkred';    // Easiest section
        } else if (difficultyScore <= 73.63) {
            return 'red';        // Moderately easy
        } else if (difficultyScore <= 86.63) {
            return 'orange';     // Hard (Larger range)
        } else {
            return 'green';      // Very Easy (Larger range)
        }
    };
    
    




    const calculateDifficulty = (attack, defense) => {
        // To prevent division by zero, ensure defense is not zero
        if (defense === 0) {
            defense = 1;
        }
        const ratio = attack / defense;
        console.log("Attack: ", attack)
        console.log("defense: ", defense)
        console.log("ratio: ", ratio)
        // Normalize the ratio to a scale of 0-100
        return (ratio / (MAX_VALUE / MIN_VALUE)) * 100;
    };
    



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
        console.log("columnIndex: ", columnIndex)
    };

    return (
        <div>
            <div>
                <label
                    className='italic pl-2' htmlFor="gameweek-select">Choose Gameweeks:</label>
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
                <HeatMap
                    xLabels={gameweeks.slice(0, selectedGameweekRange)}
                    yLabels={teamFixtureArray.map(team => team.teamName)}
                    data={teamFixtureArray.map(team => team.difficulties.map(fixture => fixture.difficulty))}
                    cellStyle={(background, value, min, max, data, x, y) => {
                        const backgroundColor = getDifficultyColor(value);
                        return {
                            background: backgroundColor,
                            fontSize: '11px',
                            color: 'white',
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