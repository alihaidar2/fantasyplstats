import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Player } from "@/types/players";

interface PlayerTableProps {
  players: Player[];
  isLoading: boolean;
  getTeamName: (teamId: number) => string;
  getPositionName: (elementTypeId: number) => string;
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;
}

export function PlayerTable({
  players,
  isLoading,
  getTeamName,
  getPositionName,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}: PlayerTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">
              Loading players...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">
              No players found
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getPositionColor = (elementTypeId: number) => {
    switch (elementTypeId) {
      case 1:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"; // GKP
      case 2:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"; // DEF
      case 3:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"; // MID
      case 4:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"; // FWD
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getFormColor = (form: string) => {
    const formValue = parseFloat(form);
    if (formValue >= 7) return "text-green-600 dark:text-green-400";
    if (formValue >= 5) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Players ({players.length})</CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Sort by:
              </label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total_points">Points</SelectItem>
                  <SelectItem value="points_per_game">PPG</SelectItem>
                  <SelectItem value="form">Form</SelectItem>
                  <SelectItem value="now_cost">Price</SelectItem>
                  <SelectItem value="selected_by_percent">Ownership</SelectItem>
                  <SelectItem value="goals_scored">Goals</SelectItem>
                  <SelectItem value="assists">Assists</SelectItem>
                  <SelectItem value="clean_sheets">Clean Sheets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Order:
              </label>
              <Select
                value={sortOrder}
                onValueChange={(value: "asc" | "desc") => setSortOrder(value)}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Desc</SelectItem>
                  <SelectItem value="asc">Asc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Player
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Team
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Position
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Price
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Points
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  PPG
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Form
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Ownership
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Goals
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  Assists
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                  CS
                </th>
              </tr>
            </thead>
            <tbody>
              {players.slice(0, 100).map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {player.web_name}
                    </div>
                    {player.news && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {player.news}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {getTeamName(player.team)}
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      className={`text-xs ${getPositionColor(
                        player.element_type
                      )}`}
                    >
                      {getPositionName(player.element_type)}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                    £{(player.now_cost / 10).toFixed(1)}m
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                    {player.total_points}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {player.points_per_game}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${getFormColor(
                      player.form
                    )}`}
                  >
                    {player.form}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {parseFloat(player.selected_by_percent).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {player.goals_scored}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {player.assists}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {player.clean_sheets}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {players.length > 100 && (
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Showing first 100 players. Use filters to narrow down results.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
