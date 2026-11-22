import type { Metadata } from "next";
import { PlayersDataTable } from "@/components/features/players/players-data-table";
import { Card } from "@/components/ui/card";
import { getSnapshot } from "@/lib/data";
import { buildPlayerRows } from "@/lib/fpl";

export const metadata: Metadata = { title: "Players | Fantasy PL Stats" };

export default function PlayersPage() {
  const players = buildPlayerRows(getSnapshot().bootstrap);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
        Player Statistics
      </h1>
      <Card className="rounded-xl border border-green-200 dark:border-green-900">
        <PlayersDataTable players={players} />
      </Card>
    </div>
  );
}
