import { Fixture } from '@/types/Fixture';
import { Team } from '@/types/Team';
import React, { useEffect, useState } from 'react';
import HeatMap from 'react-heatmap-grid';


const FixturesHeatmap: React.FC = () => {

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [heatmapData, setHeatmapData] = useState<any[][]>([]); // passed to heatmap
    // const gameweeks = Array.from({ length: 38 }, (_, i) => i + 1);
    let [gameweeks, setGameweeks] = useState<number[]>([]); // Dynamically set gameweeks
    // this should be set in useEffect().

    useEffect(() => {
        fetch('/api/fixtures')
            .then(response => response.json())
            .then(data => {
                setTeams(data.teams);
                console.log(data.fixtures)

                const unplayedGameweeks = getUnplayedGameweeks(data.fixtures);
                console.log("unplayedGameweeks: " + unplayedGameweeks)
                setGameweeks(unplayedGameweeks)

                // this currently gets an array of arrays for each team's fixture difficulties
                const updatedHeatmapData = getHeatmapData(data.fixtures, data.teams);
                setHeatmapData(updatedHeatmapData);
            })
            .catch(error => console.error('Error:', error));
    }, []);


    // this already only gets the unfinished gameweeks.
    function getHeatmapData(fixtures: Fixture[], teams: Team[]) {
        return teams.map((team: { team_id: number; }) => {
            // Filter and sort EACH TEAM'S fixtures
            let teamFixtures = fixtures
                .filter((fixture: { team_h: number; team_a: number; finished: boolean; }) => (fixture.team_h === team.team_id || fixture.team_a === team.team_id) && !fixture.finished)
                .sort((a: { event: number; }, b: { event: number; }) => a.event - b.event);
            console.log("teamFixtures: " + teamFixtures)

            // Map to team's difficulty level - returns ARRAY OF DIFFICULTIES
            return teamFixtures.map((fixture: { team_h: any; team_h_difficulty: any; team_a_difficulty: any; }) => 
                fixture.team_h === team.team_id ? fixture.team_h_difficulty : fixture.team_a_difficulty);
        });
    }

    function getUnplayedGameweeks(fixtures: Fixture[]) {
        // Filter out unfinished fixtures and extract their gameweek numbers
        const unplayedGameweeks = fixtures
            .filter(fixture => !fixture.finished && fixture.event != null && fixture.event !== null)
            .map(fixture => fixture.event);
    
        // Remove duplicates and sort the gameweeks
        const uniqueUnplayedGameweeks = Array.from(new Set(unplayedGameweeks)).sort((a, b) => a - b);
    
        return uniqueUnplayedGameweeks;
    }
    
    

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

    console.log("gameweeks: " + gameweeks)
    console.log("heatmapData: " + heatmapData)
        
    return (
        <HeatMap
            xLabels={gameweeks}
            yLabels={teams.map(team => team.short_name)}
            data={heatmapData}
            cellStyle={cellStyle}
        // ... other props
        />
        // <div>fixtures</div>
    );
};


export default FixturesHeatmap;
