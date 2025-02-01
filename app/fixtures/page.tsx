"use client";
import { GameweekTable } from "@/components/gameweek_table/gameweek_table";
import { Typography, Slider, CircularProgress } from "@mui/material";
import React, { useEffect, useState } from "react";

const FixturesPage = () => {
  const [data, setData] = useState([]);
  const [gameweekIds, setGameweeks] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState<number[]>([
    gameweekIds[0], // ✅ Always safe to use the first gameweek
    gameweekIds.length > 3
      ? gameweekIds[3]
      : gameweekIds[gameweekIds.length - 1], // Adjusts dynamically
  ]);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/fixtures");
        const { structuredTeams, gameweekIds } = await response.json();
        setData(structuredTeams);
        setGameweeks(gameweekIds);
        setSelectedRange([gameweekIds[0], gameweekIds[3]]);
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
  const filteredGameweeks = gameweekIds.filter(
    (gwId) => gwId >= selectedRange[0] && gwId <= selectedRange[1]
  );
  return (
    <div className="bg-gray-200 justify-center items-center ">
      <div className="p-4  rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">
          Fixture Difficulty Table
        </h2>
        <Typography gutterBottom>
          {gameweekIds.length > 0
            ? `Gameweek Range (${selectedRange[0]} - ${selectedRange[1]})`
            : "Gameweek Range"}
        </Typography>
        <Slider
          value={selectedRange}
          min={Math.min(...gameweekIds)}
          max={Math.max(...gameweekIds)}
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
            className="flex flex-col items-center bg-gray-200"
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
