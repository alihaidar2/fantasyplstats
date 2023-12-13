import React, { useEffect, useState } from 'react';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';
import dynamic from 'next/dynamic';
// import  HeatMap from 'react-heatmap-grid'


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

// If you are using dynamic import
const HeatMap = dynamic<HeatMapProps>(
    () => import('react-heatmap-grid').then((mod) => mod.HeatMap),
    { ssr: false }
);

const FixturesHeatmap: React.FC = () => {

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [fixtures, setFixtures] = useState<Fixture[]>([]); // passed to heatmap
    const [heatmapData, setHeatmapData] = useState<any[][]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
    const [selectedGameweekRange, setSelectedGameweeks] = useState(5); // Default value
    const [teamFixtureDictionary, setTeamFixtureDictionary] = useState<{ [teamName: string]: SimpleFixture[] }>({});

    interface SimpleFixture {
        opponentName: string;
        difficulty: number;
    }


    useEffect(() => {
        fetch('/api/fixtures')
            .then(response => response.json())
            .then(data => {
                console.log("teams: ", data.teams)
                console.log("fixtures: ", data.fixtures)
                setTeams(data.teams);
                setFixtures(data.fixtures);

                // Gets heatmap data as 2D array
                const heatmapData = getHeatmapData(data.teams, data.fixtures);
                setHeatmapData(heatmapData);

                // Creates dictionary with each team's fixtures
                const teamFixtureDictionary = data.teams.reduce((acc, team, index) => {
                    // Use the team's short name as the key, and the corresponding heatmapData2 row as the value
                    acc[team.short_name] = heatmapData[index];
                    return acc;
                }, {});

                setTeamFixtureDictionary(teamFixtureDictionary)

                // Get remaining Gameweeks
                const uniqueGameweeks: number[] = Array.from(new Set(fixtures.map(fixture => fixture.event))); // all remaining gws
                setGameweeks(uniqueGameweeks);

            })
            .catch(error => console.error('Error:', error));
    }, [selectedGameweekRange]);

    // At run time, get options for dropdown
    const generateGameweekOptions = (): JSX.Element[] => {
        let options: JSX.Element[] = [];
        for (let i = 1; i <= gameweeks.length; i++) {
            options.push(<option key={i} value={i}>{i} GW{i > 1 ? 's' : ''}</option>);
        }
        return options;
    };

    // On GW Range change
    const handleGameweekRangeChange = (event) => {
        setSelectedGameweeks(Number(event.target.value)); // this sets it but it doesnt reload with the proper data
    };

    function getHeatmapData(teams: Team[], fixtures: Fixture[]) {
        // Initialize an object to hold all teams with their opponents and difficulties
        const teamsOpponentsAndDifficulties: { [teamName: string]: SimpleFixture[] } = {};

        // Populate the object with team names as keys
        teams.forEach(team => {
            teamsOpponentsAndDifficulties[team.short_name] = [];
        });

        // Go through each fixture and add the opponent team and their difficulty
        fixtures.forEach(fixture => {
            // get home and away team
            const homeTeam = teams.find(t => t.team_id === fixture.team_h);
            const awayTeam = teams.find(t => t.team_id === fixture.team_a);

            // add the opponent name and difficulty at the HOME team key
            if (homeTeam) {
                teamsOpponentsAndDifficulties[homeTeam.short_name].push({
                    opponentName: awayTeam!.short_name,
                    difficulty: fixture.team_h_difficulty,
                });
            }

            // add the opponent name and difficulty at the AWAY team key
            if (awayTeam) {
                teamsOpponentsAndDifficulties[awayTeam.short_name].push({
                    opponentName: homeTeam!.short_name,
                    difficulty: fixture.team_a_difficulty
                });
            }
        });

        // Creates 2D array of fixtures, need to create a dictionary to map keys to this from teams
        return Object.values(teamsOpponentsAndDifficulties).map(
            (teamFixtures: SimpleFixture[]) => teamFixtures
        );

    }

    const getDifficultyColor = (difficulty: number): string => {
        switch (difficulty) {
            case 2:
                return 'darkgreen'; // Difficulty 2
            case 3:
                return 'green';     // Difficulty 3
            case 4:
                return 'red';       // Difficulty 4
            case 5:
                return 'darkred';   // Difficulty 5
            default:
                return 'gray';      // Default color
        }
    }

    return (
        <div>
            <div>
                <label htmlFor="gameweek-select">Choose Gameweeks: </label>
                <select id="gameweek-select" value={selectedGameweekRange} onChange={handleGameweekRangeChange}>
                    {generateGameweekOptions()}
                </select>
            </div>
            <HeatMap
                xLabels={gameweeks.slice(0, selectedGameweekRange)}
                yLabels={teams.map(team => team.short_name)}
                data={heatmapData.map(row => row.map(cell => cell.difficulty))} // Heatmap expects a 2D array
                cellStyle={(background, value, min, max, data, x, y) => {
                    // Use your getDifficultyColor function to determine the background color
                    const backgroundColor = getDifficultyColor(value);
                    return {
                        background: backgroundColor, // Set the background color based on the difficulty
                        fontSize: '11px', // Set the font size or any other styles you need
                        color: 'black', // Set the text color to black
                        // Add any additional styles you want to apply to each cell
                    };
                }}
                cellRender={(x, y, team) => {
                    const fixture = teamFixtureDictionary[team][y - gameweeks[0]]
                    // Render the cell with the opponent name
                    return (
                        <div>
                            {fixture.opponentName}
                        </div>
                    );
                }}
            />
        </div>
    );
};


export default FixturesHeatmap;
