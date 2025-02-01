"use client";

import { useEffect, useState } from "react";

type Player = {
  player_id: number;
  web_name: string;
  now_cost: number;
};

const DEFAULT_MANAGER_ID = "3764508"; // Your default FPL ID

const DifferentialPage = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [managerId, setManagerId] = useState(DEFAULT_MANAGER_ID); // Input field for manager ID

  const fetchManagerTeam = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/manager/${managerId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setPlayers(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch team.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagerTeam(); // Fetch on page load
  }, []);

  return (
    <div>
      <h1>FPL Differential Tool</h1>

      <div>
        <label>Enter FPL Manager ID:</label>
        <input
          type="text"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        />
        <button onClick={fetchManagerTeam} disabled={loading}>
          {loading ? "Fetching..." : "Fetch Team"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {players.length > 0 && (
        <div>
          <h2>Managers FPL Team</h2>
          <ul>
            {players.map((player) => (
              <li key={player.player_id}>
                <strong>{player.web_name}</strong> (Price:{" "}
                {player.now_cost / 10}M)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DifferentialPage;
