"use client";

import React, { useEffect, useState } from "react";
import { Container, Paper, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import "../styles/globals.css"; // Ensure Tailwind CSS is imported
import "../styles/styles.css"; // Import custom CSS for borders

// Define the columns based on the Teams schema
const columns: GridColDef[] = [
  { field: "team_name", headerName: "Team Name", flex: 0.5 },
  { field: "strength", headerName: "Strength", type: "number", flex: 0.5 },
  {
    field: "strength_overall_home",
    headerName: "Strength Home",
    type: "number",
    flex: 1,
  },
  {
    field: "strength_overall_away",
    headerName: "Strength Away",
    type: "number",
    flex: 1,
  },
  { field: "points", headerName: "Points", type: "number", flex: 0.5 },
  { field: "win", headerName: "Win", type: "number", flex: 0.5 },
  { field: "draw", headerName: "Draw", type: "number", flex: 0.5 },
  { field: "loss", headerName: "Loss", type: "number", flex: 0.5 },
  { field: "played", headerName: "Played", type: "number", flex: 0.5 },

  // { field: "position", headerName: "Position", type: "number",  ,flex: 0.5 },

  // {
  //   field: "unavailable",
  //   headerName: "Unavailable",
  //   type: "boolean",
  // ,flex: 0.5 },

  // { field: "form", headerName: "Form",  ,flex: 0.5 },

  // Add any additional fields as needed
];

export default function Teams() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        console.log("Fetching teams data...");

        const response = await fetch("/api/teams");
        const data = await response.json();
        console.log("Teams data fetched successfully:", data);
        setRows(data);
      } catch (error) {
        console.error("Error fetching teams:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, []);

  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full">
        <h1 className="text-2xl font-bold mb-4">Teams</h1>
        <div className="bg-white p-4 rounded-lg shadow-md">
          <DataGrid
            rows={rows}
            columns={columns}
            pageSizeOptions={[5, 10]}
            disableRowSelectionOnClick
            loading={loading}
            hideFooterSelectedRowCount
            className="data-grid w-full"
            disableColumnMenu // Disable the column menu
          />
        </div>
      </div>
    </div>
  );
}
