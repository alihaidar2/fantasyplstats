// The match page's sections, server-rendered except the player table's rows
// (see player-table.tsx).
//
// There is a page per match (up to 380), and Next.js writes every page's
// content about four times (the HTML, its inline payload and the .txt
// payloads), so these keep markup small: player links are plain <a> tags
// styled from their container, and table cells take their classes from the table.

import { Info } from "lucide-react";
import type { GoalLine, MatchPageData, MatchPlayer, MatchSide } from "@/lib/stats/matches";
import { playerPath } from "@/lib/site";
import { MatchStateBadge, SectionCard, TeamBadge } from "./bits";
import PlayerTableRows, { type PlayerTuple } from "./player-table";

/** Styles every player link inside the element it's on. */
export const LINKS =
  "[&_a]:font-medium [&_a]:text-emerald-700 [&_a:hover]:underline dark:[&_a]:text-emerald-300";

function A({ id, name }: { id: number; name: string }) {
  return <a href={playerPath(id)}>{name}</a>;
}

/** "Saka, Havertz (2)": a count only when it's more than one. */
function Players({ players, empty = "—" }: { players: MatchPlayer[]; empty?: string }) {
  if (players.length === 0) return <span className="text-gray-400">{empty}</span>;
  return (
    <ul>
      {players.map((p) => (
        <li key={p.id}>
          <A id={p.id} name={p.name} />
          {p.value > 1 && ` (${p.value})`}
        </li>
      ))}
    </ul>
  );
}

function Scorers({ goals }: { goals: GoalLine[] }) {
  if (goals.length === 0) return null;
  return (
    <ul className="mt-2 text-sm">
      {goals.map((g) => (
        <li key={`${g.id}-${g.ownGoal}`}>
          <A id={g.id} name={g.name} />
          {g.value > 1 && ` ×${g.value}`}
          {g.ownGoal && " (og)"}
        </li>
      ))}
    </ul>
  );
}

function TeamName({ side, align }: { side: MatchSide; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${right ? "items-end text-right" : "items-start"}`}>
      <div className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <TeamBadge team={side.team} size={40} />
        <span className="text-lg font-bold sm:text-xl">{side.team.name}</span>
      </div>
      <Scorers goals={side.goals} />
    </div>
  );
}

export function Scoreboard({ match, updated }: { match: MatchPageData; updated: string }) {
  const { home, away } = match;
  return (
    <section
      aria-label="Score"
      className={`rounded-xl border border-green-200 bg-white/90 p-4 text-gray-900 shadow-sm sm:p-6 dark:border-green-900 dark:bg-gray-800/80 dark:text-white ${LINKS}`}
    >
      <div className="flex items-start gap-3 sm:gap-6">
        <TeamName side={home} align="right" />
        <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
          <span className="rounded-lg bg-gray-900 px-3 py-1 text-2xl font-extrabold tabular-nums text-white sm:text-3xl dark:bg-gray-950">
            {home.score ?? "–"}
            <span aria-hidden> – </span>
            <span className="sr-only"> to </span>
            {away.score ?? "–"}
          </span>
          <MatchStateBadge state={match.state} minutes={match.minutes} />
        </div>
        <TeamName side={away} align="left" />
      </div>
      {match.kickoff && (
        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Kick-off <time dateTime={match.kickoffIso ?? undefined}>{match.kickoff}</time>
        </p>
      )}
      {match.state !== "finished" && (
        <p className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {match.state === "live"
              ? `In progress when the data was last updated (${updated}, ${match.minutes} minutes played). Everything here is provisional.`
              : `Full time, but FPL hasn't confirmed the result yet (data from ${updated}). Stats can still be corrected.`}
            {match.bonusSource === "provisional"
              ? " Bonus points are worked out from the current BPS, the way FPL awards them, and may change."
              : match.bonusSource === "fpl"
                ? " FPL has added the bonus points."
                : ""}
          </span>
        </p>
      )}
    </section>
  );
}

type ListKey = { [K in keyof MatchSide]: MatchSide[K] extends MatchPlayer[] ? K : never }[keyof MatchSide];

const STAT_ROWS: { key: ListKey; label: string; top?: number }[] = [
  { key: "assists", label: "Assists" },
  { key: "ownGoals", label: "Own goals" },
  { key: "penaltiesSaved", label: "Penalties saved" },
  { key: "penaltiesMissed", label: "Penalties missed" },
  { key: "saves", label: "Saves" },
  { key: "yellowCards", label: "Yellow cards" },
  { key: "redCards", label: "Red cards" },
  { key: "bonus", label: "Bonus" },
  { key: "defensiveContributions", label: "Defensive contributions (top 3)", top: 3 },
];

export function MatchStats({ match }: { match: MatchPageData }) {
  const { home, away } = match;
  const rows = STAT_ROWS.filter((r) => home[r.key].length + away[r.key].length > 0 || r.key === "bonus");
  const provisional = match.bonusSource === "provisional";
  return (
    <SectionCard id="match-stats" title="Match stats">
      <table
        className={`w-full table-fixed text-sm text-gray-900 dark:text-white [&_td]:py-2 [&_td]:align-top [&_td:first-child]:pr-2 [&_td:first-child]:text-right [&_td:last-child]:pl-2 ${LINKS}`}
      >
        <caption className="sr-only">Players with each stat, by side. A number in brackets is a count above one.</caption>
        <colgroup>
          <col />
          <col className="w-28 sm:w-40" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th scope="col" className="py-2 pr-2 text-right">
              {home.team.short}
            </th>
            <th scope="col">
              <span className="sr-only">Stat</span>
            </th>
            <th scope="col" className="py-2 pl-2 text-left">
              {away.team.short}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700 [&_th]:px-1 [&_th]:py-2 [&_th]:text-center [&_th]:text-xs [&_th]:font-semibold [&_th]:text-gray-500 dark:[&_th]:text-gray-400">
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <Players players={home[r.key].slice(0, r.top)} />
              </td>
              <th scope="row">
                {r.label}
                {r.key === "bonus" && provisional && (
                  <span className="block font-normal text-amber-700 dark:text-amber-300">provisional</span>
                )}
              </th>
              <td>
                <Players
                  players={away[r.key].slice(0, r.top)}
                  empty={r.key === "bonus" && match.bonusSource === "none" ? "Not added yet" : "—"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

export function PlayerTable({ match }: { match: MatchPageData }) {
  const provisional = match.bonusSource === "provisional";
  const rows: PlayerTuple[] = match.players.map((p) => [
    p.id,
    p.name,
    p.side === "home" ? 0 : 1,
    p.rank,
    p.bps,
    p.bonus,
    p.defensiveContribution,
  ]);
  return (
    <SectionCard
      id="players"
      title="Bonus points system (BPS)"
      aside={provisional ? <span className="text-xs text-amber-700 dark:text-amber-300">Bonus is provisional</span> : undefined}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">No BPS yet.</p>
      ) : (
        <div className="text-gray-900 dark:text-white">
          <PlayerTableRows rows={rows} clubs={[match.home.team.short, match.away.team.short]} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            The top three BPS get 3, 2 and 1 bonus points, and tied players share a place. DefCon counts clearances,
            blocks, interceptions and tackles (plus recoveries for midfielders and forwards). FPL leaves out players
            with neither BPS nor defensive contributions.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
