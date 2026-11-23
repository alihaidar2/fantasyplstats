import { getPositionColor } from "@/hooks/use-player-utils";
import PlayerStatus from "./player-status";
import { formatPrice } from "./player-format";
import { Badge } from "@/components/ui/badge";
import type { PlayerDetail } from "@/lib/fpl/transforms";

export default function PlayerHeader({ player }: Readonly<{ player: PlayerDetail }>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
        <img
          src={`https://resources.premierleague.com/premierleague/badges/t${player.teamCode}.png`}
          alt={`${player.teamName} badge`}
          width={40}
          height={40}
          className="w-10 h-10"
        />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{player.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge className={`text-sm ${getPositionColor(player.positionId)}`}>
              {player.position}
            </Badge>
            <span className="text-gray-600 dark:text-gray-400 align-middle">
              {formatPrice(player.price)}
            </span>
          </div>
        </div>
      </div>
      <PlayerStatus availability={player.availability} />
    </div>
  );
}
