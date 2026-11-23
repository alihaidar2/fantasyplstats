import { Target } from "lucide-react";
import { SET_PIECE_LABELS, type SetPieceDuty } from "@/lib/fpl/transforms";
import { ordinal } from "./player-format";

/** The player's set-piece duties, e.g. "Penalties: 1st choice". Hidden when there are none. */
export default function PlayerSetPieces({ duties }: Readonly<{ duties: SetPieceDuty[] }>) {
  if (duties.length === 0) return null;
  return (
    <section
      aria-labelledby="set-pieces"
      className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-green-200 bg-white/90 px-5 py-3 shadow-2xl dark:border-green-900 dark:bg-gray-800/80"
    >
      <h2
        id="set-pieces"
        className="flex items-center gap-2 text-lg font-bold tracking-wide text-gray-900 dark:text-white"
      >
        <Target className="h-5 w-5" aria-hidden />
        Set Pieces
      </h2>
      <ul className="flex flex-wrap gap-x-8 gap-y-1">
        {duties.map((d) => (
          <li key={d.kind} className="text-base">
            <span className="text-gray-500 dark:text-gray-400">{SET_PIECE_LABELS[d.kind]}: </span>
            <span className="font-bold text-gray-900 dark:text-white">{ordinal(d.order)} choice</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
