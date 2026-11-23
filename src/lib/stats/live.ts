// The live gameweek page (/live/): provisional bonus from BPS, each match's
// state, and every player's points so far, from the snapshot's `live` data and
// fixtures. Pure functions of the snapshot; no Next.js, React or `@/` imports,
// so tests and a future Azure Function can use them.
//
// The site is static and rebuilt on a schedule, so "live" means "as of the
// snapshot's generatedAt".

import {
  fixturesInGameweek,
  liveGameweek,
  matchStatRows,
  SCHEDULES,
  ukDateKey,
  UK_TIME_ZONE,
  type EventStatusDay,
  type Fixture,
  type LiveExplain,
  type Side,
  type Snapshot,
} from "../fpl";
import { matchPath } from "../site";
import { hasMatchPage } from "./matches/shared";
import { buildClubs } from "./teams";

// ─── Bonus ──────────────────────────────────────────────────────────────────

export interface BonusAward {
  element: number;
  side: Side;
  bps: number;
  bonus: number;
}

/**
 * FPL's bonus rule applied to a match's BPS: 3, 2 and 1 points to the three
 * highest BPS scores. Players tied on BPS share the higher award and the next
 * player drops by as many places, so a tie for first gives 3, 3, 1, a tie for
 * second 3, 2, 2, and a tie for third 3, 2, 1, 1. In ranking terms: a player
 * ranked r (1 + the number of players with more BPS) gets 4 − r, if that is
 * positive. Only positive BPS scores are ranked (FPL lists players with 0 BPS
 * nowhere). Highest BPS first, ties by player id.
 *
 * Checked against every fixture of GW1–10 of 2026/27: this gives exactly the
 * bonus FPL awarded (test/live.test.ts).
 */
export function provisionalBonus(fixture: Pick<Fixture, "stats">): BonusAward[] {
  return bonusFromBps(matchStatRows(fixture, "bps")).map((r) => ({
    element: r.element,
    side: r.side,
    bps: r.value,
    bonus: r.bonus,
  }));
}

/**
 * The rule behind `provisionalBonus`, on any list of BPS rows: the players
 * who get bonus, highest BPS first (ties keep their order in `rows`). The
 * match pages use it too, so the site has one bonus rule.
 */
export function bonusFromBps<T extends { element: number; value: number }>(rows: readonly T[]): (T & { bonus: number })[] {
  const ranked = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const awards: (T & { bonus: number })[] = [];
  for (const row of ranked) {
    const rank = 1 + ranked.filter((other) => other.value > row.value).length;
    if (rank > 3) break;
    awards.push({ ...row, bonus: 4 - rank });
  }
  return awards;
}

/**
 * Whether FPL has added a match's bonus to the points: its `bonus` stat is
 * filled in, or the match is confirmed (`finished`). Until then a player's
 * live total has no bonus from this match.
 */
export function bonusAdded(fixture: Pick<Fixture, "stats" | "finished">): boolean {
  return fixture.finished || matchStatRows(fixture, "bonus").length > 0;
}

export type BonusSource = "fpl" | "provisional" | "none";

/**
 * A match's bonus: FPL's own once added (with each player's BPS), otherwise
 * provisional bonus from the BPS so far. "none" before kickoff.
 */
export function matchBonus(fixture: Pick<Fixture, "stats" | "finished" | "started">): {
  source: BonusSource;
  awards: BonusAward[];
} {
  if (bonusAdded(fixture)) {
    const bps = new Map(matchStatRows(fixture, "bps").map((r) => [r.element, r.value]));
    const awards = matchStatRows(fixture, "bonus").map((r) => ({
      element: r.element,
      side: r.side,
      bps: bps.get(r.element) ?? 0,
      bonus: r.value,
    }));
    return { source: "fpl", awards };
  }
  if (!fixture.started) return { source: "none", awards: [] };
  const awards = provisionalBonus(fixture);
  return { source: awards.length ? "provisional" : "none", awards };
}

// ─── Match state ────────────────────────────────────────────────────────────

/**
 * - upcoming: not kicked off.
 * - live: kicked off, no final whistle yet.
 * - finished: full time (`finished_provisional`), not yet confirmed by FPL.
 * - confirmed: FPL has confirmed the result and bonus (`finished`).
 */
export type MatchState = "upcoming" | "live" | "finished" | "confirmed";

export function matchState(
  fixture: Pick<Fixture, "started" | "finished_provisional" | "finished">,
): MatchState {
  if (fixture.finished) return "confirmed";
  if (fixture.finished_provisional) return "finished";
  if (fixture.started) return "live";
  return "upcoming";
}

// ─── Refresh schedule ───────────────────────────────────────────────────────

export interface RefreshCadence {
  /** Minutes between rebuilds on a match day. */
  matchDayMinutes: number;
  /** Hours between rebuilds on other days. */
  otherDayHours: number;
}

/**
 * How often the deployed site is rebuilt, read from the workflow's schedules
 * (SCHEDULES in src/lib/fpl/schedule.ts), so the page's wording follows them:
 * the match-day cron's minute list ("5,35" is every 30 minutes) and the
 * other-day cron's hour step ("*\/2" is every 2 hours).
 */
export function refreshCadence(schedules: Record<string, string> = SCHEDULES): RefreshCadence {
  const cronFor = (role: string) => Object.entries(schedules).find(([, r]) => r === role)?.[0];
  const matchDay = cronFor("match-day")?.split(" ") ?? [];
  const otherDay = cronFor("two-hourly")?.split(" ") ?? [];
  const runsPerHour = matchDay[0]?.split(",").length ?? 0;
  const hourStep = /^\*\/(\d+)$/.exec(otherDay[1] ?? "")?.[1];
  return {
    matchDayMinutes: runsPerHour > 0 && matchDay[1] === "*" ? Math.round(60 / runsPerHour) : 60,
    otherDayHours: hourStep ? Number(hourStep) : 24,
  };
}

// ─── The page ───────────────────────────────────────────────────────────────

export interface LiveTeam {
  id: number;
  /** FPL's stable club code, for the badge image. */
  code: number;
  /** "ARS" */
  short: string;
  /** "Arsenal" */
  name: string;
  /** The club's page (/teams/arsenal/); "" for a club FPL no longer lists. */
  path: string;
  score: number | null;
}

export interface LiveMatchPlayer {
  id: number;
  name: string;
  side: Side;
  value: number;
}

export interface LiveMatch {
  id: number;
  /** The match page, once the match has kicked off (match pages exist from kick-off). */
  path: string | null;
  kickoff: string | null;
  /** "15:00", UK time, or null when unscheduled. */
  kickoffLabel: string | null;
  state: MatchState;
  /** Match minutes played so far (FPL's `minutes`). */
  minutes: number;
  home: LiveTeam;
  away: LiveTeam;
  /** "ARS 2–1 CHE", or "ARS v CHE" before kickoff. */
  label: string;
  bonusSource: BonusSource;
  bonus: (LiveMatchPlayer & { bps: number })[];
  goals: LiveMatchPlayer[];
  assists: LiveMatchPlayer[];
}

export interface LiveDay {
  /** YYYY-MM-DD, UK date; null for matches without a kickoff time. */
  date: string | null;
  /** "Saturday 5 September" */
  label: string;
  /** FPL's event-status row for the day, if it lists one. */
  status: Pick<EventStatusDay, "points" | "bonus_added"> | null;
  matches: LiveMatch[];
}

export interface LivePlayerRow {
  id: number;
  name: string;
  fullName: string;
  team: string;
  positionId: number;
  position: string;
  /** FPL's live points: bonus is included only for matches where FPL has added it. */
  points: number;
  /** Bonus from matches whose bonus FPL hasn't added yet, worked out from BPS. Not in `points`. */
  provisionalBonus: number;
  /** Bonus FPL has added plus provisional bonus. */
  bonus: number;
  /** `points` plus `provisionalBonus`: what the player will have if the BPS order holds. */
  projected: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bps: number;
  /** Ids of the matches the player played in. */
  matches: number[];
}

export interface LivePage {
  gameweek: number;
  days: LiveDay[];
  /** Every match of the gameweek, in kickoff order. */
  matches: LiveMatch[];
  /** Everyone who has played, highest projected points first. */
  players: LivePlayerRow[];
  counts: Record<MatchState, number>;
  /** Goals scored so far (own goals included). */
  goals: number;
  /** True when every match's bonus has been added by FPL. */
  allBonusAdded: boolean;
}

const kickoffFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "2026-09-05" -> "Saturday 5 September". */
export function formatDayKey(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

type LiveSnapshot = Pick<Snapshot, "bootstrap" | "fixtures" | "live">;

/** Per player, the bonus from matches where FPL hasn't added it yet. */
export function pendingBonus(fixtures: readonly Fixture[]): Map<number, number> {
  const pending = new Map<number, number>();
  for (const fixture of fixtures) {
    if (!fixture.started || bonusAdded(fixture)) continue;
    for (const award of provisionalBonus(fixture)) {
      pending.set(award.element, (pending.get(award.element) ?? 0) + award.bonus);
    }
  }
  return pending;
}

/** The ids of the fixtures a live player was on the pitch in, from their points breakdown. */
function matchesPlayed(explain: readonly LiveExplain[]): number[] {
  return explain
    .filter((entry) => entry.stats.some((s) => s.identifier === "minutes" && s.value > 0))
    .map((entry) => entry.fixture);
}

/**
 * The live page's data, or null when there's no current gameweek
 * (pre-season, or between seasons).
 */
export function buildLivePage(snapshot: LiveSnapshot): LivePage | null {
  const live = liveGameweek(snapshot);
  if (!live) return null;

  const { elements, teams, element_types } = snapshot.bootstrap;
  const players = new Map(elements.map((e) => [e.id, e]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const positionById = new Map(element_types.map((p) => [p.id, p.singular_name_short]));
  const nameOf = (id: number) => {
    const e = players.get(id);
    return e ? e.web_name.trim() || `${e.first_name} ${e.second_name}`.trim() : `Player ${id}`;
  };
  const clubPath = new Map(buildClubs(teams).map((c) => [c.id, c.path]));
  const team = (id: number, score: number | null): LiveTeam => ({
    id,
    code: teamById.get(id)?.code ?? 0,
    short: teamById.get(id)?.short_name ?? "—",
    name: teamById.get(id)?.name ?? "Unknown",
    path: clubPath.get(id) ?? "",
    score,
  });

  const fixtures = fixturesInGameweek(snapshot, live.gameweek);
  const matches: LiveMatch[] = fixtures.map((f) => {
    const state = matchState(f);
    const home = team(f.team_h, f.started ? f.team_h_score : null);
    const away = team(f.team_a, f.started ? f.team_a_score : null);
    const { source, awards } = matchBonus(f);
    const named = (rows: { element: number; side: Side; value: number }[]) =>
      rows.map((r) => ({ id: r.element, name: nameOf(r.element), side: r.side, value: r.value }));
    const scored = home.score !== null && away.score !== null;
    return {
      id: f.id,
      path: hasMatchPage(f) ? matchPath(f.id) : null,
      kickoff: f.kickoff_time,
      kickoffLabel: f.kickoff_time ? kickoffFormat.format(new Date(f.kickoff_time)) : null,
      state,
      minutes: f.minutes,
      home,
      away,
      label: scored ? `${home.short} ${home.score}–${away.score} ${away.short}` : `${home.short} v ${away.short}`,
      bonusSource: source,
      bonus: awards.map((a) => ({ id: a.element, name: nameOf(a.element), side: a.side, value: a.bonus, bps: a.bps })),
      goals: named(matchStatRows(f, "goals_scored")),
      assists: named(matchStatRows(f, "assists")),
    };
  });

  // Days, in kickoff order, each with FPL's event-status row for that date.
  const days: LiveDay[] = [];
  for (const match of matches) {
    const date = match.kickoff ? ukDateKey(new Date(match.kickoff)) : null;
    let day = days.find((d) => d.date === date);
    if (!day) {
      const status = date ? live.days.find((d) => d.date === date) : undefined;
      day = {
        date,
        label: date ? formatDayKey(date) : "Date to be confirmed",
        status: status ? { points: status.points, bonus_added: status.bonus_added } : null,
        matches: [],
      };
      days.push(day);
    }
    day.matches.push(match);
  }

  const pending = pendingBonus(fixtures);
  const rows: LivePlayerRow[] = [];
  for (const p of live.players.values()) {
    if (p.stats.minutes <= 0) continue;
    const e = players.get(p.id);
    const provisional = pending.get(p.id) ?? 0;
    rows.push({
      id: p.id,
      name: nameOf(p.id),
      fullName: e ? `${e.first_name} ${e.second_name}`.trim() : nameOf(p.id),
      team: e ? (teamById.get(e.team)?.short_name ?? "—") : "—",
      positionId: e?.element_type ?? 0,
      position: (e && positionById.get(e.element_type)) ?? "—",
      points: p.stats.total_points,
      provisionalBonus: provisional,
      bonus: p.stats.bonus + provisional,
      projected: p.stats.total_points + provisional,
      minutes: p.stats.minutes,
      goals: p.stats.goals_scored,
      assists: p.stats.assists,
      cleanSheets: p.stats.clean_sheets,
      bps: p.stats.bps,
      matches: matchesPlayed(p.explain),
    });
  }
  rows.sort((a, b) => b.projected - a.projected || b.bps - a.bps || a.id - b.id);

  const counts: Record<MatchState, number> = { upcoming: 0, live: 0, finished: 0, confirmed: 0 };
  for (const m of matches) counts[m.state]++;

  return {
    gameweek: live.gameweek,
    days,
    matches,
    players: rows,
    counts,
    goals: matches.reduce((sum, m) => sum + (m.home.score ?? 0) + (m.away.score ?? 0), 0),
    allBonusAdded: fixtures.length > 0 && fixtures.every(bonusAdded),
  };
}

/** Event-status's `points` flag in words: "" before the day's matches, "p" provisional, "r" confirmed (unverified). */
export function dayPointsLabel(points: string): string {
  if (points === "p") return "Points provisional";
  if (points === "r") return "Points confirmed";
  if (points === "") return "Not started";
  return `Status "${points}"`;
}

/**
 * How often the bonus rule in `provisionalBonus` gives exactly the bonus FPL
 * awarded, over every confirmed match with bonus in the snapshot.
 */
export function bonusCheck(fixtures: readonly Fixture[]): { matches: number; agree: number } {
  let matches = 0;
  let agree = 0;
  for (const f of fixtures) {
    const fpl = matchStatRows(f, "bonus");
    if (!f.finished || fpl.length === 0) continue;
    matches++;
    const ours = new Map(provisionalBonus(f).map((a) => [a.element, a.bonus]));
    if (ours.size === fpl.length && fpl.every((r) => ours.get(r.element) === r.value)) agree++;
  }
  return { matches, agree };
}
