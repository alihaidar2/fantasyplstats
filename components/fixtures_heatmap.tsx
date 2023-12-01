import React, { useEffect, useState } from 'react';
import HeatMap from 'react-heatmap-grid';
import { Fixture } from '../types/Fixture';
import { Team } from '../types/Team';


const FixturesHeatmap: React.FC = () => {

    const [teams, setTeams] = useState<Team[]>([]); // passed to heatmap
    const [fixtures, setFixtures] = useState<Fixture[]>([]); // passed to heatmap
    const [heatmapData, setHeatmapData] = useState<any[][]>([]); // passed to heatmap
    const [gameweeks, setGameweeks] = useState<number[]>([]); // Initialize as an empty array
    const [selectedGameweekRange, setSelectedGameweeks] = useState(5); // Default value


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
                const customHeatmapData = sampleHeatmapData.map(row => row.slice(0, selectedGameweekRange));
                console.log("heatmap data:", customHeatmapData)
                setHeatmapData(customHeatmapData);

                // Get remaining Gameweeks
                const uniqueGameweeks: number[] = Array.from(new Set(fixtures.map(fixture => fixture.event))); // all remaining gws
                // const limitedGameweeks = uniqueGameweeks.slice(0, selectedGameweekRange);
                setGameweeks(uniqueGameweeks);
                // setSelectedGameweeks(limitedGameweeks.length);

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


    // To be implemented
    function getHeatmapData() {

    }

    // On GW range change
    const handleGameweekRangeChange = (event) => {
        console.log("value chosen: ", event.target.value)
        setSelectedGameweeks(Number(event.target.value)); // this sets it but it doesnt reload with the proper data
        console.log("selectedGameweekRange: ", selectedGameweekRange)
    };

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
                data={heatmapData}
                // cellStyle={cellStyle}
            // ... other props
            />

        </div>

    );
};


export default FixturesHeatmap;
