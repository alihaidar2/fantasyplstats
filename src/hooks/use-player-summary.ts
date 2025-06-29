import { useEffect, useState } from "react";
import { PlayerElementSummary } from "@/types/players";

export default function usePlayerSummary(playerId: number) {
  const [summary, setSummary] = useState<PlayerElementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    setSummaryLoading(true);
    setSummaryError(null);
    fetch(`/api/player-summary/${playerId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch player summary");
        return res.json();
      })
      .then((data) => setSummary(data))
      .catch((err) => setSummaryError(err.message))
      .finally(() => setSummaryLoading(false));
  }, [playerId]);

  return { summary, summaryLoading, summaryError };
}
