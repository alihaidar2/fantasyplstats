"use client";
import { GameweekTable } from "@/components/gameweek_table/gameweek_table";
import { Typography, Slider, CircularProgress } from "@mui/material";
import React, { useEffect, useState } from "react";

console.log(`Listening on port ${process.env.PORT}`);

const FixturesPage = () => {
  const [data, setData] = useState([]);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState<number[]>([
    gameweeks[0],
    gameweeks[3],
  ]);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/fixtures");
        const { structuredTeams, gameweeks } = await response.json();
        setData(structuredTeams);
        setGameweeks(gameweeks);
        setSelectedRange([gameweeks[0], gameweeks[3]]);
      } catch (err) {
        console.error("Error fetching data: ", err);
      }
    };
    fetchData();
  }, []);
  // Handler to update selected gameweek range
  const handleSliderChange = (event: unknown, newValue: number | number[]) => {
    setSelectedRange(newValue as number[]);
  };
  // Filter gameweeks based on selected range
  const filteredGameweeks = gameweeks.filter(
    (gwId) => gwId >= selectedRange[0] && gwId <= selectedRange[1]
  );
  return (
    <div className="bg-gray-200 justify-center items-center ">
      <div className="p-4  rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">
          Fixture Difficulty Table
        </h2>
        <Typography gutterBottom>
          Gameweek Range [{selectedRange[0]} - {selectedRange[1]}]
        </Typography>
        <Slider
          value={selectedRange}
          min={Math.min(...gameweeks)}
          max={Math.max(...gameweeks)}
          onChange={handleSliderChange}
          valueLabelDisplay="auto"
          aria-labelledby="range-slider"
        />
        {data.length > 0 ? (
          <GameweekTable
            data={data}
            gameweeks={filteredGameweeks}
            selectedRange={selectedRange}
          />
        ) : (
          <div
            className="flex justify-center items-center h-screen bg-gray-200"
            style={{ minHeight: "100vh" }}
          >
            <CircularProgress />
          </div>
        )}
      </div>
    </div>
  );
};

export default FixturesPage;
