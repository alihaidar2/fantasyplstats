import { useEffect, useState } from "react";
import { PlayerElementSummary } from "@/types/players";

type SummaryResult = {
  playerId: number;
  summary: PlayerElementSummary | null;
  error: string | null;
};

export default function usePlayerSummary(playerId: number) {
  // The last finished request. Loading is derived from it rather than set
  // inside the effect: a result for another player means we're still loading.
  const [result, setResult] = useState<SummaryResult | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/player-summary/${playerId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch player summary");
        return res.json();
      })
      .then((summary: PlayerElementSummary) => {
        if (!ignore) setResult({ playerId, summary, error: null });
      })
      .catch((err: Error) => {
        if (!ignore) setResult({ playerId, summary: null, error: err.message });
      });
    return () => {
      ignore = true;
    };
  }, [playerId]);

  const current = result?.playerId === playerId ? result : null;

  return {
    summary: current?.summary ?? null,
    summaryLoading: current === null,
    summaryError: current?.error ?? null,
  };
}
