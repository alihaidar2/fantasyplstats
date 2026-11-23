import type { LiveMatch, LiveMatchPlayer, MatchState } from "@/lib/stats/live";
import { cardClass, PlayerLink, TeamBadge } from "./shared";

const STATE_STYLES: Record<MatchState, string> = {
  upcoming: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  live: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  finished: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

/** A match's state in words, for its badge. */
export function stateLabel(match: Pick<LiveMatch, "state" | "minutes" | "kickoffLabel">): string {
  switch (match.state) {
    case "upcoming":
      return match.kickoffLabel ? `Kick-off ${match.kickoffLabel}` : "Not started";
    case "live":
      return match.minutes > 0 ? `Live · ${match.minutes}′` : "Live";
    case "finished":
      return "Full time · provisional";
    case "confirmed":
      return "Confirmed";
  }
}

function StateBadge({ match }: { match: LiveMatch }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${STATE_STYLES[match.state]}`}>
      {match.state === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-300" aria-hidden />}
      {stateLabel(match)}
    </span>
  );
}

function Contributors({ label, players }: { label: string; players: LiveMatchPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      <span className="font-medium text-gray-500 dark:text-gray-400">{label}: </span>
      {players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <PlayerLink id={p.id} name={p.name} className="hover:underline" />
          {p.value > 1 && <span className="tabular-nums"> ×{p.value}</span>}
        </span>
      ))}
    </p>
  );
}

function BonusList({ match }: { match: LiveMatch }) {
  if (match.bonusSource === "none") {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {match.state === "upcoming" ? "Bonus is worked out once the match starts." : "No bonus points yet."}
      </p>
    );
  }
  const provisional = match.bonusSource === "provisional";
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {provisional ? "Provisional bonus (from BPS so far)" : "Bonus awarded by FPL"}
      </h4>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Bonus</th>
            <th scope="col">Player</th>
            <th scope="col">BPS</th>
          </tr>
        </thead>
        <tbody>
          {match.bonus.map((b) => (
            <tr key={b.id}>
              <td className="w-8 py-0.5">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    provisional
                      ? "border border-dashed border-amber-500 text-amber-800 dark:text-amber-200"
                      : "bg-emerald-600 text-white dark:bg-emerald-500"
                  }`}
                >
                  {b.value}
                </span>
              </td>
              <td className="py-0.5">
                <PlayerLink id={b.id} name={b.name} />
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  {b.side === "home" ? match.home.short : match.away.short}
                </span>
              </td>
              <td className="py-0.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{b.bps} BPS</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A club's short name linking to its page, with the full name on hover and for screen readers. */
function ClubName({ team }: { team: LiveMatch["home"] }) {
  const name = (
    <abbr title={team.name} className="no-underline">
      {team.short}
    </abbr>
  );
  return team.path ? (
    <a href={team.path} className="truncate font-semibold hover:underline">
      {name}
    </a>
  ) : (
    <span className="truncate font-semibold">{name}</span>
  );
}

/** One match of the gameweek: score, state, scorers and assisters, and bonus (provisional or FPL's). */
export function MatchCard({ match }: { match: LiveMatch }) {
  const titleId = `match-${match.id}`;
  return (
    <article aria-labelledby={titleId} className={`${cardClass} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <StateBadge match={match} />
        {match.path && (
          <a href={match.path} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
            Match stats<span className="sr-only">: {match.home.name} v {match.away.name}</span>
          </a>
        )}
      </div>
      <h3 id={titleId} className="flex items-center justify-between gap-2 text-gray-900 dark:text-white">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <TeamBadge code={match.home.code} name={match.home.name} />
          <ClubName team={match.home} />
        </span>
        <span className="shrink-0 text-xl font-bold tabular-nums">
          {match.home.score !== null && match.away.score !== null ? (
            <>
              {match.home.score}
              <span className="mx-1 text-gray-400" aria-hidden>
                –
              </span>
              <span className="sr-only"> to </span>
              {match.away.score}
            </>
          ) : (
            <span className="text-base font-medium text-gray-500 dark:text-gray-400">v</span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ClubName team={match.away} />
          <TeamBadge code={match.away.code} name={match.away.name} />
        </span>
      </h3>
      {(match.goals.length > 0 || match.assists.length > 0) && (
        <div className="space-y-1">
          <Contributors label="Goals" players={match.goals} />
          <Contributors label="Assists" players={match.assists} />
        </div>
      )}
      <BonusList match={match} />
    </article>
  );
}
