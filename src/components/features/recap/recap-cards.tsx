// A recap's story cards (saved recap version 2), as data graphics: a strip of
// key numbers, the captaincy with its big number, players with ownership
// bars, results, transfers with their runs, and short notes. Server
// components with no hooks: they ship no client JavaScript. Every recap page
// repeats them, so styles sit on the containers and decorative pieces are
// plain spans with aria-hidden.

import Link from "next/link";
import { ClubBadge } from "@/components/features/teams/team-bits";
import {
  cardTitle,
  formatCount,
  formatNumbersInText,
  formatPercent,
  runCaption,
  type RunKind,
} from "@/lib/recap/cards";
import type { RecapEntities } from "@/lib/recap-pages";
import type { PublishedCard } from "@/lib/recaps";
import { cn } from "@/lib/utils";

type Heading = "h2" | "h3";
type CardOf<T extends PublishedCard["type"]> = Extract<PublishedCard, { type: T }>;
interface CardProps<T extends PublishedCard["type"]> {
  card: CardOf<T>;
  id: string;
  heading: Heading;
  entities: RecapEntities;
}

const kicker = "text-xs font-semibold uppercase tracking-wider";
const panel = "flex flex-col gap-3 rounded-2xl border border-green-200 bg-white/90 p-4 shadow-sm sm:p-5 dark:border-green-900 dark:bg-gray-800/80";
const lineText = "text-sm leading-relaxed text-gray-700 dark:text-gray-300";
const muted = "text-xs text-gray-600 dark:text-gray-400";

/** "16 pts" with the unit in words for screen readers. */
function Points({ points, className }: { points: number; className?: string }) {
  return (
    <span className={cn("font-bold tabular-nums", className)}>
      {formatCount(points)} <abbr title="points" className="no-underline">pts</abbr>
    </span>
  );
}

/** A player's name, linked to their page, with their club's badge and short name when the snapshot knows them. */
function PlayerName({
  name,
  refId,
  entities,
  badge = false,
  onDark = false,
}: {
  name: string;
  refId?: string;
  entities: RecapEntities;
  badge?: boolean;
  /** On the dark captaincy card. */
  onDark?: boolean;
}) {
  const known = refId ? entities.players[refId] : undefined;
  if (!known) return <span className="font-bold">{name}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {badge && <ClubBadge code={known.badge} size={18} />}
      <Link href={known.path} prefetch={false} className="truncate font-bold hover:underline">
        {name}
      </Link>
      <span className={cn("text-xs font-medium", onDark ? "text-gray-300" : "text-gray-500 dark:text-gray-400")}>{known.team}</span>
    </span>
  );
}

function CardText({ text, className }: { text?: string; className?: string }) {
  return text?.trim() ? <p className={cn(lineText, className)}>{formatNumbersInText(text.trim())}</p> : null;
}

function NumbersCard({ card, id, heading: H }: CardProps<"numbers">) {
  return (
    <section aria-labelledby={id}>
      <H id={id} className="sr-only">
        {cardTitle(card)}
      </H>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {card.items.map((item, i) => (
          <div
            key={i}
            className="flex flex-col-reverse items-center rounded-xl border border-green-200 bg-white/90 px-2 py-2.5 text-center shadow-sm dark:border-green-900 dark:bg-gray-800/80"
          >
            <dt className={muted}>{item.label}</dt>
            <dd className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{formatNumbersInText(item.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CaptaincyCard({ card, id, heading: H, entities }: CardProps<"captaincy">) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-2xl bg-gray-900 p-4 text-white shadow-sm sm:p-5 dark:border dark:border-gray-700 dark:bg-gray-950"
    >
      <H id={id} className={cn(kicker, "text-orange-300")}>
        {cardTitle(card)}
      </H>
      <div className="flex items-end gap-4">
        <p className="text-6xl font-bold leading-none tabular-nums">
          {formatCount(card.points)}
          <span className="sr-only"> points</span>
        </p>
        <div className="flex min-w-0 flex-col gap-0.5 pb-1">
          <span className="text-lg">
            <PlayerName name={card.player} refId={card.ref} entities={entities} onDark />
          </span>
          <span className="text-sm text-gray-300">
            <span aria-hidden>pts</span>
            {card.ownership !== undefined && <> · owned by {formatPercent(card.ownership)}</>}
          </span>
        </div>
      </div>
      {card.tiles && card.tiles.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {card.tiles.map((tile, i) => (
            <div key={i} className="flex flex-col-reverse rounded-xl bg-gray-800 p-2.5 dark:bg-gray-900">
              <dt className="text-xs text-gray-300">
                {tile.player && <span className="font-semibold text-white">{tile.player} </span>}
                {tile.label}
              </dt>
              <dd className={cn("text-xl font-bold tabular-nums", tile.player && "text-emerald-300")}>
                {formatNumbersInText(tile.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(card.badge || card.text) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
          {card.badge && (
            <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-bold text-white">
              {formatNumbersInText(card.badge)}
            </span>
          )}
          <CardText text={card.text} className="text-gray-300 dark:text-gray-300" />
        </div>
      )}
    </section>
  );
}

function PlayersCard({ card, id, heading: H, entities }: CardProps<"players">) {
  const bars = card.players.some((p) => p.ownership !== undefined);
  return (
    <section aria-labelledby={id} className={panel}>
      <H id={id} className={cn(kicker, "text-emerald-700 dark:text-emerald-400")}>
        {cardTitle(card)}
      </H>
      <ul className="flex flex-col gap-3">
        {card.players.map((p) => (
          <li key={p.ref} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-gray-900 dark:text-white">
              <PlayerName name={p.player} refId={p.ref} entities={entities} badge />
              <Points points={p.points} />
            </div>
            {p.ownership !== undefined && (
              <span aria-hidden className="block h-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                <span
                  className="block h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.max(1.5, p.ownership))}%` }}
                />
              </span>
            )}
            {(p.detail || p.ownership !== undefined) && (
              <p className={muted}>
                {[p.detail && formatNumbersInText(p.detail), p.ownership !== undefined && `owned by ${formatPercent(p.ownership)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {bars && <p className={muted}>Bars show ownership.</p>}
      <CardText text={card.text} />
    </section>
  );
}

function Club({ name, entities, align }: { name: string; entities: RecapEntities; align: "start" | "end" }) {
  const club = entities.clubs[name];
  return (
    <span className={cn("flex min-w-0 items-center gap-2 font-semibold", align === "end" && "flex-row-reverse text-right")}>
      {club && <ClubBadge code={club.badge} size={20} />}
      {club ? (
        <>
          {/* The short name on phones, where two full names and a score don't fit. */}
          <abbr title={name} className="no-underline sm:hidden">
            {club.short}
          </abbr>
          <span className="hidden truncate sm:inline">{name}</span>
        </>
      ) : (
        <span className="truncate">{name}</span>
      )}
    </span>
  );
}

function MatchesCard({ card, id, heading: H, entities }: CardProps<"matches">) {
  return (
    <section aria-labelledby={id} className={panel}>
      <H id={id} className={cn(kicker, "text-gray-600 dark:text-gray-400")}>
        {cardTitle(card)}
      </H>
      <ul className="flex flex-col gap-2 text-gray-900 dark:text-white">
        {card.matches.map((m, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-900/60"
          >
            <Club name={m.home} entities={entities} align="start" />
            <span className="text-xl font-bold tabular-nums">{m.score.replace("-", "–")}</span>
            <Club name={m.away} entities={entities} align="end" />
          </li>
        ))}
      </ul>
      <CardText text={card.text} />
    </section>
  );
}

/** The run as blocks: filled for scoring or returns, dashed for weeks without minutes, outlined for blanks. */
function RunBlocks({ kind, gameweeks }: { kind: RunKind; gameweeks: number }) {
  const shown = Math.min(gameweeks, 10);
  const block =
    kind === "no-minutes"
      ? "border-2 border-dashed border-orange-600 dark:border-orange-400"
      : kind === "blanks"
        ? "border-2 border-gray-400 dark:border-gray-500"
        : "bg-emerald-600 dark:bg-emerald-500";
  return (
    <span aria-hidden className="flex gap-1.5">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={cn("size-5 rounded-md", block)} />
      ))}
    </span>
  );
}

function TransfersCard({ card, id, heading: H, entities }: CardProps<"transfers">) {
  return (
    <section aria-labelledby={id} className={panel}>
      <H id={id} className={cn(kicker, "text-gray-600 dark:text-gray-400")}>
        {cardTitle(card)}
      </H>
      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
        {card.moves.map((m) => (
          <li key={m.ref} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-gray-900 dark:text-white">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <PlayerName name={m.player} refId={m.ref} entities={entities} badge />
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    m.direction === "in" ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400",
                  )}
                >
                  <span aria-hidden>{m.direction === "in" ? "▲" : "▼"} </span>
                  {formatCount(m.netTransfers)} net transfers {m.direction}
                </span>
              </span>
              <span className="flex gap-3">
                {m.points !== undefined && <Points points={m.points} />}
                {m.minutes !== undefined && (
                  <span className="font-bold tabular-nums">
                    {formatCount(m.minutes)} <abbr title="minutes" className="no-underline">mins</abbr>
                  </span>
                )}
              </span>
            </div>
            {(m.run || m.detail) && (
              <div className="flex flex-wrap items-center gap-2">
                {m.run && <RunBlocks kind={m.run.kind} gameweeks={m.run.gameweeks} />}
                <span className={muted}>
                  {[m.run && runCaption(m.run.kind, m.run.gameweeks), m.detail && formatNumbersInText(m.detail)].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <CardText text={card.text} />
    </section>
  );
}

function NotesCard({ card, id, heading: H, entities }: CardProps<"notes">) {
  return (
    <section aria-labelledby={id} className={panel}>
      <H id={id} className={cn(kicker, "text-gray-600 dark:text-gray-400")}>
        {cardTitle(card)}
      </H>
      <ul className="flex flex-col gap-2 text-sm text-gray-800 dark:text-gray-200">
        {card.items.map((n, i) => {
          const line = formatNumbersInText(n.text.trim());
          const startsWithName = n.player && line.toLowerCase().startsWith(n.player.toLowerCase());
          return (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span>
                {n.player && !startsWithName && (
                  <>
                    <PlayerName name={n.player} refId={n.ref} entities={entities} />{" "}
                  </>
                )}
                {line}
              </span>
              {n.points !== undefined && <Points points={n.points} className="shrink-0 text-gray-900 dark:text-white" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The cards in order. `heading` is the level of each card's title: h2 on the
 * recap page (under the headline's h1), h3 on the home page.
 */
export default function RecapCards({
  cards,
  entities,
  heading = "h2",
  idPrefix = "recap-card",
  footer,
  className,
}: {
  cards: readonly PublishedCard[];
  entities: RecapEntities;
  heading?: Heading;
  idPrefix?: string;
  /** A small line under the cards: who wrote the recap and how it was checked. */
  footer?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {cards.map((card, i) => {
        const props = { id: `${idPrefix}-${i + 1}`, heading, entities };
        switch (card.type) {
          case "numbers":
            return <NumbersCard key={i} card={card} {...props} />;
          case "captaincy":
            return <CaptaincyCard key={i} card={card} {...props} />;
          case "players":
            return <PlayersCard key={i} card={card} {...props} />;
          case "matches":
            return <MatchesCard key={i} card={card} {...props} />;
          case "transfers":
            return <TransfersCard key={i} card={card} {...props} />;
          case "notes":
            return <NotesCard key={i} card={card} {...props} />;
        }
      })}
      {footer && <p className="px-3 pt-1 text-center text-xs leading-relaxed text-gray-600 dark:text-gray-400">{footer}</p>}
    </div>
  );
}
