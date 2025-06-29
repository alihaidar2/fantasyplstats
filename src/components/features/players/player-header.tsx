import { getPositionColor } from "@/hooks/use-player-utils";
import PlayerStatus from "./player-status";
import { Badge } from "@/components/ui/badge";
import type { Player } from "@/types/players";

export default function PlayerHeader({
  player,
  getPositionName,
}: Readonly<{
  player: Player;
  getPositionName: (id: number) => string;
}>) {
  return (
    <div className="flex items-start justify-between gap-4 pl-2">
      <div className="flex items-center gap-4">
        <img
          src={`https://resources.premierleague.com/premierleague/badges/t${player.team_code}.png`}
          alt="Team badge"
          width={40}
          height={40}
          className="w-10 h-10"
        />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {player.first_name} {player.second_name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge
              className={`text-sm ${getPositionColor(player.element_type)}`}
            >
              {getPositionName(player.element_type)}
            </Badge>
            <span className="text-gray-600 dark:text-gray-400 align-middle">
              £{(player.now_cost / 10).toFixed(1)}m
            </span>
          </div>
        </div>
      </div>
      <PlayerStatus status={player.status} news={player.news} />
    </div>
  );
}
