"use client";

import { PlayersDataTable } from "@/components/features/players/players-data-table";
import { usePlayers } from "@/hooks/use-players";
import { Card } from "@/components/ui/card";

export default function PlayersPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
        Player Statistics
      </h1>
      <PlayersContent />
    </div>
  );
}

function PlayersContent() {
  const { players, isLoading, error, getTeamName, getPositionName } =
    usePlayers();

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 text-lg font-medium mb-2">
            Error loading players
          </div>
          <div className="text-gray-600 dark:text-gray-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <Card className="rounded-xl border border-green-200 dark:border-green-900">
      <PlayersDataTable
        players={players}
        isLoading={isLoading}
        getTeamName={getTeamName}
        getPositionName={getPositionName}
      />
    </Card>
  );
}
