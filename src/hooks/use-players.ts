"use client";

import { useState, useEffect, useMemo } from "react";
import { Player } from "@/types/players";
import { Team, ElementType } from "@/types/fixtures";

interface UsePlayersReturn {
  players: Player[];
  teams: Team[];
  elementTypes: ElementType[];
  isLoading: boolean;
  error: string | null;
  getTeamName: (teamId: number) => string;
  getPositionName: (elementTypeId: number) => string;
  sortedPlayers: Player[];
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;
}

export function usePlayers(): UsePlayersReturn {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [elementTypes, setElementTypes] = useState<ElementType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("total_points");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/players");
        if (!response.ok) {
          throw new Error("Failed to fetch players");
        }

        const bootstrapData = await response.json();
        setPlayers(bootstrapData.elements);
        setTeams(bootstrapData.teams);
        setElementTypes(bootstrapData.element_types);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case "total_points":
          aValue = a.total_points;
          bValue = b.total_points;
          break;
        case "points_per_game":
          aValue = parseFloat(a.points_per_game) || 0;
          bValue = parseFloat(b.points_per_game) || 0;
          break;
        case "form":
          aValue = parseFloat(a.form) || 0;
          bValue = parseFloat(b.form) || 0;
          break;
        case "now_cost":
          aValue = a.now_cost;
          bValue = b.now_cost;
          break;
        case "selected_by_percent":
          aValue = parseFloat(a.selected_by_percent) || 0;
          bValue = parseFloat(b.selected_by_percent) || 0;
          break;
        case "goals_scored":
          aValue = a.goals_scored;
          bValue = b.goals_scored;
          break;
        case "assists":
          aValue = a.assists;
          bValue = b.assists;
          break;
        case "clean_sheets":
          aValue = a.clean_sheets;
          bValue = b.clean_sheets;
          break;
        default:
          aValue = a.total_points;
          bValue = b.total_points;
      }

      if (sortOrder === "asc") {
        return aValue - bValue;
      }
      return bValue - aValue;
    });

    return sorted;
  }, [players, sortBy, sortOrder]);

  const getTeamName = (teamId: number) => {
    const team = teams.find((t) => t.id === teamId);
    return team?.short_name || "Unknown";
  };

  const getPositionName = (elementTypeId: number) => {
    const elementType = elementTypes.find((et) => et.id === elementTypeId);
    return elementType?.singular_name || "Unknown";
  };

  return {
    players,
    teams,
    elementTypes,
    isLoading,
    error,
    getTeamName,
    getPositionName,
    sortedPlayers,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
  };
}
