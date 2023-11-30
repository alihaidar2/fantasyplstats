import React, { useEffect, useState } from 'react';
import HeatMap from 'react-heatmap-grid';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';


const FixturesHeatmap: React.FC = () => {

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [fixtures, setFixtures] = useState<Fixture[]>([]); // passed to heatmap
    const [heatmapData, setHeatmapData] = useState<any[][]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array

    useEffect(() => {
        fetch('/api/fixtures')
            .then(response => response.json())
            .then(data => {
                console.log("teams: ", data.teams)
                console.log("fixtures: ", data.fixtures)
                setTeams(data.teams);
                setFixtures(data.fixtures);

                // TO-DO: Modify this to get actual heatmap data
                const sampleHeatmapData = Array.from({ length: 20 }, () => Array.from({ length: 25 }, () => Math.floor(Math.random() * 5) + 1));
                console.log("sampleHeatmapData: ", sampleHeatmapData)
                setHeatmapData(sampleHeatmapData);

                const uniqueGameweeks: number[] = Array.from(new Set(fixtures.map(fixture => fixture.event)));
                console.log("unique gameweeks: ", uniqueGameweeks)
                setGameweeks(uniqueGameweeks);

            })
            .catch(error => console.error('Error:', error));
    }, []);


    // To be implemented
    function getHeatmapData() {

    }


    // this already only gets the unfinished gameweeks.
    // function getHeatmapData(fixtures: Fixture[], teams: Team[]) {
    //     return teams.map((team: { team_id: number; }) => {
    //         // Filter and sort EACH TEAM'S fixtures
    //         let teamFixtures = fixtures
    //             .filter((fixture: { team_h: number; team_a: number; finished: boolean; }) => (fixture.team_h === team.team_id || fixture.team_a === team.team_id) && !fixture.finished)
    //             .sort((a: { event: number; }, b: { event: number; }) => a.event - b.event);
    //         // console.log("teamFixtures: " + teamFixtures)

    //         // Map to team's difficulty level - returns ARRAY OF DIFFICULTIES
    //         return teamFixtures.map((fixture: { team_h: any; team_h_difficulty: any; team_a_difficulty: any; }) =>
    //             fixture.team_h === team.team_id ? fixture.team_h_difficulty : fixture.team_a_difficulty);
    //     });
    // }




    const cellStyle = (background: any, value: number, min: number, max: number, data: any, x: any, y: any) => {
        // Normalize the value
        const normalizedValue = (value - min) / (max - min);

        // Interpolate between green (lower difficulty) and red (higher difficulty)
        const red = normalizedValue * 255; // More difficult = more red
        const green = (1 - normalizedValue) * 255; // Less difficult = more green

        return {
            background: `rgb(${red}, ${green}, 0)`,
            // ... other styles
        };
    };

    // Generating the 2D array
    // const heatmapData = Array.from({ length: 20 }, () => Array.from({ length: 25 }, () => Math.floor(Math.random() * 5) + 1));
    // console.log("heatmapData: ", heatmapData)
    const teamNames = teams.map(team => team.short_name)
    console.log("team names: ", teams.map(team => team.short_name))

    return (
        <HeatMap
            xLabels={gameweeks}
            yLabels={teamNames}
            data={heatmapData}
            // cellStyle={cellStyle}
        // ... other props
        />
    );
};


export default FixturesHeatmap;
