"use client";

import { useParams } from "next/navigation";
import { usePlayers } from "@/hooks/use-players";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart2,
  Goal,
  Shield,
  Flag,
  Award,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Spinner } from "@/components/common/Spinner";
import PlayerPointsChart from "@/components/features/players/player-points-chart";
import { getFormColor } from "@/hooks/use-player-utils";
import usePlayerSummary from "@/hooks/use-player-summary";
import PlayerHeader from "@/components/features/players/player-header";

function PlayerLoading() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    </div>
  );
}

function PlayerError({ error }: { error: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 text-lg font-medium mb-2">
            Error loading player
          </div>
          <div className="text-gray-600 dark:text-gray-400">{error}</div>
        </div>
      </div>
    </div>
  );
}

function PlayerNotFound() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-gray-600 dark:text-gray-400 text-lg font-medium mb-2">
            Player not found
          </div>
          <Link href="/players">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Players
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PlayerPage() {
  const params = useParams();
  const playerId = parseInt(params.id as string);

  const { players, isLoading, error, getPositionName } = usePlayers();
  const player = players.find((p) => p.id === playerId);

  const { summary, summaryLoading, summaryError } = usePlayerSummary(playerId);

  if (isLoading) return <PlayerLoading />;
  if (error) return <PlayerError error={error} />;
  if (!player) return <PlayerNotFound />;

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <Link href="/players">
        <Button
          variant="outline"
          className="mb-6 text-base font-medium text-gray-900 dark:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Players
        </Button>
      </Link>

      <div className="mb-10">
        <PlayerHeader player={player} getPositionName={getPositionName} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Season Stats */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Season Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Total Points
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.total_points}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Points Per Game
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.points_per_game}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Form
                  </span>
                  <span
                    className={`font-extrabold text-lg ${getFormColor(
                      player.form
                    )}`}
                  >
                    {player.form}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Ownership
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {parseFloat(player.selected_by_percent).toFixed(1)}%
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Attacking Stats */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <Goal className="w-5 h-5" />
              Attacking
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Goals
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.goals_scored}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Assists
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.assists}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Expected Goals
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.expected_goals}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Expected Assists
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.expected_assists}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Defensive Stats */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Defensive
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Clean Sheets
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.clean_sheets}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Goals Conceded
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.goals_conceded}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Saves
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.saves}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Expected Goals Conceded
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.expected_goals_conceded}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Discipline */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <Flag className="w-5 h-5" />
              Discipline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Yellow Cards
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.yellow_cards}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Red Cards
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.red_cards}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Own Goals
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.own_goals}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Penalties Missed
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.penalties_missed}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <Award className="w-5 h-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Influence
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.influence}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Creativity
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.creativity}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Threat
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.threat}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    ICT Index
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.ict_index}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Game Time */}
        <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Game Time
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Minutes Played
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.minutes}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Starts
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.starts}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    Bonus Points
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.bonus}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 dark:text-gray-400 text-base">
                    BPS
                  </span>
                  <span className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {player.bps}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Move the chart below the cards */}
      <div className="my-6">
        <Card className="rounded-xl border border-green-200 dark:border-green-900">
          {summaryLoading ? (
            <Spinner />
          ) : summaryError ? (
            <div className="text-red-600 dark:text-red-400 text-center">
              {summaryError}
            </div>
          ) : summary && summary.history.length > 0 ? (
            <PlayerPointsChart history={summary.history} />
          ) : null}
        </Card>
      </div>
    </div>
  );
}
