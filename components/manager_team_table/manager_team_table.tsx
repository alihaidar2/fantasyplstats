"use client";

import { useEffect, useState } from "react";

type Player = {
  player_id: number;
  web_name: string;
  team_id: number;
  element_type: number;
  now_cost: number;
};

const PlayerList = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch("/api/players");
        const data = await res.json();

        if (data.error) {
          setError(data.error);
        } else {
          setPlayers(data); // ✅ Store player data in state
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Failed to fetch player data.");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []); // ✅ Run only once when component mounts

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div>
      <h2>FPL Players</h2>
      <ul>
        {players.map((player) => (
          <li key={player.player_id}>
            <strong>{player.web_name}</strong> (Price: {player.now_cost / 10}M)
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PlayerList;
