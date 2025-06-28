"use client";

import { useState, useEffect } from "react";
import { MatrixRow } from "@/types/fixtures";

interface UseFixturesReturn {
  data: MatrixRow[] | null;
  isLoading: boolean;
  error: string | null;
}

// Custom hook for fetching fixtures data
export function useFixtures(): UseFixturesReturn {
  const [data, setData] = useState<MatrixRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFixtures = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/fixtures");
        if (!response.ok) {
          throw new Error("Failed to fetch fixtures");
        }

        const fixturesData = await response.json();
        setData(fixturesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFixtures();
  }, []);

  return { data, isLoading, error };
}
