import type { Metadata } from "next";
import { ordinal } from "@/components/features/players/player-format";
import { CARD, EmptyState, HubPage, MUTED, PlayerName, STRONG } from "@/components/features/players-hub/hub-ui";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { badgeUrl } from "@/lib/site";
import { buildSetPieces, hasSetPieceData, PLAYERS_HUB_PATHS, type ClubSetPieces } from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";

const PATH = PLAYERS_HUB_PATHS.setPieces;

export const metadata: Metadata = pageMetadata({
  title: "FPL set-piece takers: penalties, free kicks and corners",
  description:
    "Who takes penalties, direct free kicks and corners at every Premier League club, in Fantasy Premier League's order of preference.",
  path: PATH,
});

const CHIP = "rounded px-1 text-[11px] font-semibold tabular-nums";
const FIRST = cn(CHIP, "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200");
const NEXT = cn(CHIP, "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200");

function ClubCard({ club }: Readonly<{ club: ClubSetPieces }>) {
  const headingId = `club-${club.shortName.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className={cn(CARD, "p-4")}>
      <h2 id={headingId} className={cn("mb-3 flex items-center gap-2 font-bold", STRONG)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
        <img
          src={badgeUrl(club.code)}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          className="h-6 w-6"
        />
        {club.name}
      </h2>
      <dl className="space-y-2 text-sm">
        {club.duties.map((d) => (
          <div key={d.kind}>
            <dt className={cn("text-xs font-medium uppercase tracking-wide", MUTED)}>{d.label}</dt>
            <dd className="mt-0.5">
              {d.takers.length === 0 ? (
                <span className={MUTED}>Not listed</span>
              ) : (
                <ol className="flex flex-wrap gap-x-3 gap-y-1">
                  {d.takers.map((t) => (
                    <li key={t.id} className="inline-flex items-center gap-1">
                      <span className={t.order === 1 ? FIRST : NEXT} title={`${ordinal(t.order)} choice`}>
                        {t.order}
                      </span>
                      <PlayerName player={t} />
                    </li>
                  ))}
                </ol>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function SetPiecesPage() {
  const clubs = buildSetPieces(getSnapshot().bootstrap);

  return (
    <HubPage
      path={PATH}
      title="Set-piece takers"
      intro={
        <>
          <p>
            Who is on penalties, direct free kicks, and corners and indirect free kicks at every club, in FPL&apos;s
            order of preference (1 is first choice). A badge marks a taker who is injured, doubtful or suspended,
            so you can see who is next in line.
          </p>
          <p className="text-xs">
            FPL updates these orders by hand and irregularly, sometimes weeks after a change on the pitch. Treat
            them as a guide and check recent matches before relying on one.
          </p>
        </>
      }
    >
      {hasSetPieceData(clubs) ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {clubs.map((c) => (
            <ClubCard key={c.teamId} club={c} />
          ))}
        </div>
      ) : (
        <EmptyState title="No set-piece takers yet.">
          FPL hasn&apos;t published its set-piece orders for this season. They usually appear before the first
          gameweek.
        </EmptyState>
      )}
    </HubPage>
  );
}
