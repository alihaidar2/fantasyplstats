"use client";
import { useState, useEffect } from "react";
import ManagerTeamTable from "@/components/manager_team_table/manager_team_table";
import Manager from "@/types/manager";
import Player from "@/types/player";

// Single panel that manages its own ID, loading, etc.
interface ManagerPanelProps {
  defaultManagerId?: string;
  title?: string;
  onPlayersFetched?: (players: Player[]) => void; // ✅ New prop
}

const ManagerPanel: React.FC<ManagerPanelProps> = ({
  defaultManagerId = "3764508",
  onPlayersFetched, // ✅ Callback function
  //   title = "FPL Differential Tool",
}) => {
  // Panel-specific states
  const [managerId, setManagerId] = useState(defaultManagerId);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Manager[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // ========== Fetch Manager Team ==========
  const fetchManagerTeam = async () => {
    if (!managerId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/manager/${managerId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setPlayers(data);
        if (onPlayersFetched) onPlayersFetched(data); // ✅ Send data to parent
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch team.");
    } finally {
      setLoading(false);
    }
  };

  // ========== Debounce ==========
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // ========== Search for manager by team name ==========
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    const fetchManagers = async () => {
      try {
        const response = await fetch(
          `/api/manager/searchManagers?query=${debouncedQuery}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error("Error searching managers:", error);
      }
    };
    fetchManagers();
  }, [debouncedQuery]);

  return (
    <div className="p-6 bg-gray-100 border border-gray-300 rounded-lg shadow-md w-full">
      {/* <h1 className="text-xl font-bold text-left mb-4">{title}</h1> */}

      <div className="flex flex-col items-start gap-3 mb-6 w-full">
        {/* Manager ID Input & Button */}
        <label className="text-gray-700 font-medium">
          Enter FPL Manager ID:
        </label>
        <div className="flex items-center gap-3 w-full">
          <input
            type="text"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="px-4 py-2 font-medium border border-gray-300 rounded-md flex-grow focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchManagerTeam}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white font-medium rounded-md hover:bg-blue-600 transition w-auto disabled:bg-gray-400"
          >
            {loading ? "Fetching..." : "Fetch Team"}
          </button>
        </div>

        {/* Team Name Search */}
        <label className="text-gray-700 font-medium mt-4">
          Search by Team Name:
        </label>
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search team name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {results.length > 0 && (
            <ul className="absolute w-full bg-white border border-gray-300 rounded-md mt-1 shadow-md z-10 max-h-60 overflow-auto">
              {results.map((manager) => (
                <li
                  key={manager.entry_id}
                  className="px-4 py-2 hover:bg-gray-200 cursor-pointer text-gray-800"
                  onClick={() => {
                    setManagerId(manager.entry_id.toString());
                    setQuery(manager.team_name);
                    setResults([]);
                    fetchManagerTeam();
                  }}
                >
                  {manager.team_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="text-red-500">{error}</p>}
      {!loading && players.length > 0 && <ManagerTeamTable players={players} />}
    </div>
  );
};

export default ManagerPanel;
