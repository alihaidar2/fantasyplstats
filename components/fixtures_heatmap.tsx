import React, { useEffect, useState } from 'react';
import HeatMap from 'react-heatmap-grid';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';



const FixturesHeatmap: React.FC = () => {

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [fixtures, setFixtures] = useState<Fixture[]>([]); // passed to heatmap
    const [heatmapData, setHeatmapData] = useState<any[][]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
    const [selectedGameweekRange, setSelectedGameweeks] = useState(gameweeks.length); // Default value
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
                const heatmapData = getHeatmapData();
                setHeatmapData(heatmapData);

                // Creates dictionary with each team's fixtures
                const teamFixtureDictionary = teams.reduce((acc, team, index) => {
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

    function getHeatmapData() {
        // Initialize an object to hold all teams with their opponents and difficulties
        const teamsOpponentsAndDifficulties: { [teamName: string]: SimpleFixture[] } = {};
        // console.log("teamsOpponentsAndDifficulties before: ", teamsOpponentsAndDifficulties)

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
        // finish with team's : (fixtures && difficulties)
        // console.log("teamsOpponentsAndDifficulties after: ", teamsOpponentsAndDifficulties)

        // Creates 2D array of fixtures, need to create a dictionary to map keys to this from teams
        return Object.values(teamsOpponentsAndDifficulties).map(
            (teamFixtures: SimpleFixture[]) => teamFixtures
        );

    }



    // const teamFixtureDictionary = {};

    // teams.forEach((team, index) => {
    //     // Ensure that heatmapData has the same order and length as teams
    //     teamFixtureDictionary[team.short_name] = heatmapData[index];
    // });

    console.log("teamFixtureDictionary: ", teamFixtureDictionary)


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


    // console.log("heatmapData: ", heatmapData)

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
                    // Safeguard against undefined data
                    if (!heatmapData[y] || heatmapData[y].length <= x) {
                        return <div className="text-center text-black">N/A</div>; // Placeholder with Tailwind classes
                    }

                    // const fixture = heatmapData[y][x];
                    const fixture = teamFixtureDictionary[team][y - gameweeks[0]]
                    const backgroundColorClass = getDifficultyColor(fixture.difficulty); // This should return a Tailwind color class

                    // Render the cell with the opponent name and the background color based on difficulty
                    return (
                        <div className={`text-center ${backgroundColorClass} text-black`}>
                            {fixture.opponentName}
                        </div>
                    );
                }}



            />
        </div>

    );
};


export default FixturesHeatmap;
