"use client";
import { GameweekTable } from "@/components/gameweek_table/gameweek_table";
import { Typography, Slider } from "@mui/material";
import React, { useEffect, useState } from "react";

const GameweeksTablePage = () => {
  const [data, setData] = useState([]);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState([
    gameweeks[0],
    gameweeks[3],
  ]);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((res) => res.json())
      .then(({ structuredTeams, gameweeks }) => {
        setData(structuredTeams); // The new data structure includes `teams`
        setGameweeks(gameweeks);
        setSelectedRange([gameweeks[0], gameweeks[3]]);
      })
      .catch((err) => {
        console.error("Error fetching data: ", err);
      });
  }, []);

  // Handler to update selected gameweek range
  const handleSliderChange = (event: any, newValue: any) => {
    setSelectedRange(newValue);
  };

  // Filter gameweeks based on selected range
  const filteredGameweeks = gameweeks.filter(
    (gwId) => gwId >= selectedRange[0] && gwId <= selectedRange[1]
  );

  return (
    <div className=" bg-gray-100 justify-center items-center">
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">
          Fixture Difficulty Table
        </h2>
        {/* Gameweek Range Slider */}
        <Typography gutterBottom>Gameweek Range</Typography>
        <Slider
          value={selectedRange}
          min={Math.min(...gameweeks)}
          max={Math.max(...gameweeks)}
          onChange={handleSliderChange}
          valueLabelDisplay="auto"
          aria-labelledby="range-slider"
        />
        <Typography>
          Showing Gameweeks {selectedRange[0]} to {selectedRange[1]}
        </Typography>
        {data.length > 0 ? (
          <div>
            <GameweekTable
              data={data}
              gameweeks={filteredGameweeks}
              selectedRange={selectedRange}
            />
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </div>
  );
};

export default GameweeksTablePage;
