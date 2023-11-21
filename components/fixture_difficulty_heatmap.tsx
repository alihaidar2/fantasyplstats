import React, { useEffect, useState } from 'react';
import HeatMap from 'react-heatmap-grid';
import { Team } from '../types/Team';

interface TeamsHeatmapProps {
  teams: Team[];
}

const TeamsHeatmap: React.FC<TeamsHeatmapProps> = ({ teams }) => {
  const [labelWidth, setLabelWidth] = useState(150); // Default width

  useEffect(() => {

    const measureTextWidth = (text: string) => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        context.font = "11px Arial"; // Match the font-size and font-family of your labels
        return context.measureText(text).width;
      }
      return 0; // Return a default width if context is null
    };

    const maxWidth = teams.reduce((max, team) => {
      const width = measureTextWidth(team.team_name);
      return width > max ? width : max;
    }, 0);

    setLabelWidth(maxWidth + 50); // Add some padding
  }, [teams]); // Dependency array, the effect runs when 'teams' changes

  const strengthData = teams.map(team => [team.strength]);

  // Will determine the color of the cell based on strength
  // Will change to be based off of the difficulty (new function) 
  // const getColor = (value: number, min: number, max: number) => {
  //   // Calculate the ratio of the value within the range
  //   const ratio = (value - min) / (max - min);

  //   // Interpolate between dark red and dark green based on the ratio
  //   const red = (1 - ratio) * 139; // Dark red component decreases with higher values
  //   const green = ratio * 100; // Dark green component increases with higher values
  //   const blue = 0; // No blue component

  //   return `rgb(${red}, ${green}, ${blue})`;
  // };

  const cellStyle = (background: any, value: number, min: number, max: number, data: any, x: number, y: any) => {
    let style: React.CSSProperties = {
      background: `rgb(0, 151, 230, ${1 - (max - value) / (max - min)})`, // cahnge this to red to green
      fontSize: '11px',
      color: '#fff',
      width: '50px', // Width for each cell
      height: '50px',  // Height for each cell
      display: 'flex',
      alignItems: 'center', // Vertically center
      justifyContent: 'center', // Horizontally center
    };

    return style;
  };

  console.log("labelWidth: " + labelWidth)


  return (
    <HeatMap
      xLabels={['Strength']}
      yLabels={teams.map(team => team.team_name)}
      data={strengthData}
      squares
      xLabelWidth={10}
      yLabelWidth={labelWidth}
      // yLabelTextAlign="center"
      cellStyle={cellStyle}
      cellRender={(value: any) => value && `${value}`}
    />
  );
};

export default TeamsHeatmap;
