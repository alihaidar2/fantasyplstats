import { ChevronRight } from "lucide-react";
import type { MatchListItem } from "@/lib/stats/matches";
import { MatchStateBadge, TeamBadge } from "./bits";

// Rows take their styles from the list (descendant selectors), so each of the
// up to 38 gameweek pages carries less markup. Team names are the short name
// (an <abbr>) on phones and the full name from `sm` up.
const LIST =
  "divide-y divide-gray-100 dark:divide-gray-700 " +
  "[&_.row]:flex [&_.row]:items-center [&_.row]:gap-2 [&_.row]:rounded-lg [&_.row]:px-2 [&_.row]:py-2 " +
  "[&_a.row:hover]:bg-emerald-50 dark:[&_a.row:hover]:bg-emerald-900/20 " +
  "[&_.team]:flex [&_.team]:min-w-0 [&_.team]:flex-1 [&_.team]:items-center [&_.team]:gap-2 [&_.team]:font-medium [&_.team]:text-gray-900 dark:[&_.team]:text-white " +
  "[&_abbr]:no-underline sm:[&_abbr]:hidden [&_.full]:hidden sm:[&_.full]:inline [&_.full]:truncate";

function Name({ team }: { team: MatchListItem["home"] }) {
  return (
    <>
      <abbr title={team.name}>{team.short}</abbr>
      <span className="full">{team.name}</span>
    </>
  );
}

function Score({ match }: { match: MatchListItem }) {
  if (match.homeScore === null || match.awayScore === null) {
    return <span className="text-sm text-gray-500 dark:text-gray-400">v</span>;
  }
  return (
    <span className="rounded-md bg-gray-900 px-2 py-0.5 font-bold tabular-nums text-white dark:bg-gray-950">
      {match.homeScore}–{match.awayScore}
    </span>
  );
}

function Row({ match }: { match: MatchListItem }) {
  const body = (
    <>
      <span className="team justify-end text-right">
        <Name team={match.home} />
        <TeamBadge team={match.home} size={20} />
      </span>
      <span className="w-14 shrink-0 text-center">
        <Score match={match} />
      </span>
      <span className="team">
        <TeamBadge team={match.away} size={20} />
        <Name team={match.away} />
      </span>
      <span className="hidden w-44 shrink-0 text-right text-xs text-gray-500 md:block dark:text-gray-400">{match.kickoff}</span>
      <span className="w-20 shrink-0 text-right">
        {match.state !== "finished" && <MatchStateBadge state={match.state} minutes={match.minutes} />}
      </span>
      {match.path ? <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden /> : <span className="w-4" />}
    </>
  );
  if (!match.path) return <div className="row">{body}</div>;
  const label =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.home.name} ${match.homeScore}–${match.awayScore} ${match.away.name}`
      : `${match.home.name} v ${match.away.name}`;
  const status = match.state === "finished" ? "" : `, ${match.state}`;
  return (
    <a href={match.path} aria-label={`${label}${status}: match stats`} className="row">
      {body}
    </a>
  );
}

/** A gameweek's matches in kickoff order; each links to its match page once it has kicked off. */
export default function ResultsList({ matches }: { matches: MatchListItem[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">No matches are scheduled in this gameweek.</p>;
  }
  return (
    <ul className={LIST}>
      {matches.map((m) => (
        <li key={m.id}>
          <Row match={m} />
        </li>
      ))}
    </ul>
  );
}
