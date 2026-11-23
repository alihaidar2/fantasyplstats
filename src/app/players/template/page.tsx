import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { formatPrice } from "@/components/features/players/player-format";
import { CARD, EmptyState, HubPage, MUTED, Section, STRONG } from "@/components/features/players-hub/hub-ui";
import { formatOwnership } from "@/components/features/players-hub/hub-format";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { playerPath } from "@/lib/site";
import {
  buildTemplateTeam,
  PLAYERS_HUB_PATHS,
  STARTING_BUDGET,
  type HubPlayer,
  type TemplateTeam,
} from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";

const PATH = PLAYERS_HUB_PATHS.template;

export const metadata: Metadata = pageMetadata({
  title: "FPL template team: the most-owned squad and XI",
  description:
    "The Fantasy Premier League template: the valid 15-man squad with the highest ownership, its most-owned starting XI, and what it costs.",
  path: PATH,
});

function PitchPlayer({ player, captain }: Readonly<{ player: HubPlayer; captain?: boolean }>) {
  return (
    <li className="flex w-[6.5rem] flex-col items-center rounded-lg bg-white/95 px-1.5 py-1.5 text-center shadow-sm sm:w-32 dark:bg-gray-900/90">
      <Link
        href={playerPath(player.id)}
        prefetch={false}
        title={player.fullName}
        className={cn("w-full truncate text-sm font-semibold hover:underline", STRONG)}
      >
        {player.name}
      </Link>
      <span className={cn("text-[11px]", MUTED)}>
        {player.team} · {formatPrice(player.price)}
      </span>
      <span className="text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-300">
        {formatOwnership(player.ownership)}
        <span className="sr-only"> owned</span>
      </span>
      {(captain || player.availability) && (
        <span className="mt-0.5 flex items-center gap-1">
          {captain && (
            <span
              className="rounded bg-gray-900 px-1 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900"
              title="Most captained"
            >
              C<span className="sr-only">: most captained</span>
            </span>
          )}
          <AvailabilityBadge availability={player.availability} className="px-1 py-0 text-[10px]" />
        </span>
      )}
    </li>
  );
}

function Pitch({ team }: Readonly<{ team: TemplateTeam }>) {
  return (
    <div className={cn(CARD, "overflow-hidden p-0")}>
      <div
        className="space-y-4 bg-gradient-to-b from-emerald-600 to-emerald-700 px-2 py-5 dark:from-emerald-900 dark:to-emerald-950"
        aria-label={`Starting XI, ${team.formation}`}
        role="group"
      >
        {team.lines.map((line) => (
          <div key={line.positionId}>
            <h3 className="sr-only">{line.label}</h3>
            <ul className="flex flex-wrap justify-center gap-2 sm:gap-4">
              {line.players.map((p) => (
                <PitchPlayer key={p.id} player={p} captain={team.captain?.id === p.id} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="bg-gray-100 px-2 py-4 dark:bg-gray-800">
        <h3 className={cn("mb-2 text-center text-xs font-semibold uppercase tracking-wide", MUTED)}>Bench</h3>
        <ol className="flex flex-wrap justify-center gap-2 sm:gap-4">
          {team.bench.map((p) => (
            <PitchPlayer key={p.id} player={p} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: Readonly<{ label: string; value: string; note?: string }>) {
  return (
    <div className={cn(CARD, "px-4 py-3")}>
      <dt className={cn("text-xs font-medium uppercase tracking-wide", MUTED)}>{label}</dt>
      <dd className={cn("text-xl font-bold tabular-nums", STRONG)}>{value}</dd>
      {note && <dd className={cn("text-xs", MUTED)}>{note}</dd>}
    </div>
  );
}

export default function TemplatePage() {
  const { bootstrap } = getSnapshot();
  const team = buildTemplateTeam(bootstrap);
  const captain = team?.captain;
  const captainName = captain && team.lines.flatMap((l) => l.players).find((p) => p.id === captain.id)?.name;

  return (
    <HubPage
      path={PATH}
      title="Template team"
      intro={
        <p>
          The squad most FPL managers are converging on: the valid 15 (2 goalkeepers, 5 defenders, 5 midfielders,
          3 forwards, at most 3 from one club) with the highest combined ownership, and its most-owned starting XI.
          Owning the template protects your rank; beating it takes the players it doesn&apos;t have.
        </p>
      }
    >
      {!team ? (
        <EmptyState title="No template team yet.">
          It appears once FPL publishes ownership for enough players to fill a valid squad.
        </EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Formation" value={team.formation} />
            <Stat
              label="Squad cost"
              value={formatPrice(team.squadCost)}
              note={
                team.squadCost > STARTING_BUDGET
                  ? `${formatPrice(team.squadCost - STARTING_BUDGET)} over the ${formatPrice(STARTING_BUDGET)} starting budget`
                  : `${formatPrice(STARTING_BUDGET - team.squadCost)} under the ${formatPrice(STARTING_BUDGET)} starting budget`
              }
            />
            <Stat label="Starting XI cost" value={formatPrice(team.startingCost)} />
            <Stat label="Average ownership" value={formatOwnership(team.averageOwnership)} note="Across all 15" />
          </dl>

          <Section
            id="template-xi"
            title={`Most-owned XI (${team.formation})`}
            description={
              <>
                Each player&apos;s share of managers who own them. The XI is the squad&apos;s most-owned players in a
                valid formation (1 goalkeeper, at least 3 defenders, 2 midfielders and 1 forward); the bench is in
                FPL&apos;s order, goalkeeper first.
                {captain && captainName && (
                  <>
                    {" "}
                    C marks {captainName}, the most-captained player in Gameweek {captain.gameweek}.
                  </>
                )}
              </>
            }
          >
            <Pitch team={team} />
          </Section>

          <Section id="effective-ownership" title="Ownership isn't effective ownership">
            <div className={cn(CARD, "space-y-2 p-4 text-sm", MUTED)}>
              <p>
                The percentages here are FPL&apos;s ownership: the share of all
                managers with the player somewhere in their 15, including on the bench and in teams nobody manages
                any more. What decides whether a player&apos;s points gain or cost you rank is{" "}
                <strong className={STRONG}>effective ownership</strong> (EO): the share of managers who actually
                start them, with captains counted twice (three times with Triple Captain).
              </p>
              <p>
                A player owned by 60% who is captained by most of them can have an EO well over 100%, so if they
                haul, owners who didn&apos;t captain them still fall behind. A player owned by 30% who sits on most
                benches has an EO far below 30%. FPL doesn&apos;t publish effective ownership; other sites estimate
                it from samples of managers&apos; teams (such as the top 10,000), which this site doesn&apos;t
                fetch.
              </p>
              <p>
                Prices are today&apos;s. Managers who bought before a rise hold the player at a lower selling price,
                so the template&apos;s cost here ({formatPrice(team.squadCost)}) is not what any one manager paid.
                Players with equal ownership are separated by total points.
              </p>
            </div>
          </Section>
        </>
      )}
    </HubPage>
  );
}
