// The league table and the club pages (/teams/ and /teams/<slug>/), computed
// from the snapshot's fixtures and players. Pure functions; relative imports,
// no Next.js, React or `@/`, so tests and a future Azure Function can use them.
//
// FPL's own `teams[].played/win/draw/loss/points` read 0 all season
// (docs/fpl-api.md), so everything here is rebuilt from `fixtures`.

import {
  buildPlayerRows,
  UK_TIME_ZONE,
  type Bootstrap,
  type Element,
  type Fixture,
  type PlayerRow,
  type Snapshot,
  type Team,
} from "../fpl";
import { badgeUrl, PATHS, teamPath } from "../site";

type SnapshotParts = Pick<Snapshot, "bootstrap" | "fixtures">;

// ─── Clubs and slugs ────────────────────────────────────────────────────────

export const TEAMS_PATH = PATHS.teams;

export { badgeUrl, teamPath };

/**
 * Full names and slugs for clubs whose FPL name is abbreviated, keyed by the
 * club's `code`, which (unlike `id`) stays the same across seasons, so a URL
 * never changes when FPL renumbers the clubs for a new season. Any club not
 * listed (a newly promoted one, say) gets a slug from its FPL name.
 */
const CLUB_OVERRIDES: Record<number, { fullName: string; slug: string }> = {
  1: { fullName: "Manchester United", slug: "manchester-united" },
  2: { fullName: "Leeds United", slug: "leeds-united" },
  4: { fullName: "Newcastle United", slug: "newcastle-united" },
  6: { fullName: "Tottenham Hotspur", slug: "tottenham-hotspur" },
  13: { fullName: "Leicester City", slug: "leicester-city" },
  17: { fullName: "Nottingham Forest", slug: "nottingham-forest" },
  21: { fullName: "West Ham United", slug: "west-ham-united" },
  35: { fullName: "West Bromwich Albion", slug: "west-bromwich-albion" },
  36: { fullName: "Brighton & Hove Albion", slug: "brighton-and-hove-albion" },
  39: { fullName: "Wolverhampton Wanderers", slug: "wolverhampton-wanderers" },
  43: { fullName: "Manchester City", slug: "manchester-city" },
  49: { fullName: "Sheffield United", slug: "sheffield-united" },
  102: { fullName: "Luton Town", slug: "luton-town" },
};

/** "Nott'm Forest" -> "nottm-forest", "Brighton & Hove" -> "brighton-and-hove", accents folded. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface Club {
  /** FPL's id this season (1–20). */
  id: number;
  /** Stable across seasons; the badge image uses it. */
  code: number;
  /** FPL's name ("Man City"). */
  name: string;
  /** "MCI" */
  shortName: string;
  /** "Manchester City" (FPL's name when it isn't abbreviated). */
  fullName: string;
  slug: string;
  path: string;
}

/**
 * Every club with its slug, alphabetical by FPL name. Slugs are unique: if two
 * clubs would share one, both get their `code` appended.
 */
export function buildClubs(teams: readonly Pick<Team, "id" | "code" | "name" | "short_name">[]): Club[] {
  const base = teams.map((t) => {
    const override = CLUB_OVERRIDES[t.code];
    return { team: t, fullName: override?.fullName ?? t.name, slug: override?.slug ?? (slugify(t.name) || `club-${t.code}`) };
  });
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b.slug, (counts.get(b.slug) ?? 0) + 1);
  return base
    .map(({ team, fullName, slug }) => {
      const unique = counts.get(slug)! > 1 ? `${slug}-${team.code}` : slug;
      return {
        id: team.id,
        code: team.code,
        name: team.name,
        shortName: team.short_name,
        fullName,
        slug: unique,
        path: teamPath(unique),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

// ─── Results ────────────────────────────────────────────────────────────────

export type Outcome = "W" | "D" | "L";

/**
 * A fixture whose score counts: FPL's `finished` (confirmed), or
 * `finished_provisional` (full time, FPL hasn't confirmed bonus yet). The
 * Premier League's own table updates at full time, so this one does too.
 */
export function isResult(f: Fixture): f is Fixture & { team_h_score: number; team_a_score: number } {
  return (f.finished || f.finished_provisional) && f.team_h_score !== null && f.team_a_score !== null;
}

/** Kicked off but not yet at full time when the snapshot was taken. Not counted anywhere. */
export function isInProgress(f: Fixture): boolean {
  return f.started === true && !isResult(f);
}

/** Not started: a fixture still to play (including postponed ones with no gameweek). */
export function isUpcoming(f: Fixture): boolean {
  return !f.started && !isResult(f) && !f.finished && !f.finished_provisional;
}

const byKickoff = (a: Fixture, b: Fixture) =>
  (a.kickoff_time ?? "9999").localeCompare(b.kickoff_time ?? "9999") || a.id - b.id;

export interface ClubResult {
  fixtureId: number;
  gameweek: number | null;
  kickoff: string | null;
  home: boolean;
  opponentId: number;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  /** Full time, but FPL hasn't confirmed the result yet (`finished_provisional`). */
  provisional: boolean;
}

const outcomeOf = (goalsFor: number, goalsAgainst: number): Outcome =>
  goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";

/** A club's results, oldest first. */
export function clubResults(fixtures: readonly Fixture[], teamId: number): ClubResult[] {
  return fixtures
    .filter((f) => (f.team_h === teamId || f.team_a === teamId) && isResult(f))
    .sort(byKickoff)
    .map((f) => {
      const home = f.team_h === teamId;
      const goalsFor = (home ? f.team_h_score : f.team_a_score)!;
      const goalsAgainst = (home ? f.team_a_score : f.team_h_score)!;
      return {
        fixtureId: f.id,
        gameweek: f.event,
        kickoff: f.kickoff_time,
        home,
        opponentId: home ? f.team_a : f.team_h,
        goalsFor,
        goalsAgainst,
        outcome: outcomeOf(goalsFor, goalsAgainst),
        provisional: !f.finished,
      };
    });
}

export interface ClubRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Matches in which the club conceded nothing. */
  cleanSheets: number;
}

export const EMPTY_RECORD: Readonly<ClubRecord> = Object.freeze({
  played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, cleanSheets: 0,
});

/** Totals over a list of results: 3 points a win, 1 a draw. */
export function summarise(results: readonly Pick<ClubResult, "goalsFor" | "goalsAgainst" | "outcome">[]): ClubRecord {
  const r = { ...EMPTY_RECORD };
  for (const m of results) {
    r.played++;
    r.goalsFor += m.goalsFor;
    r.goalsAgainst += m.goalsAgainst;
    if (m.outcome === "W") r.won++;
    else if (m.outcome === "D") r.drawn++;
    else r.lost++;
    if (m.goalsAgainst === 0) r.cleanSheets++;
  }
  r.goalDifference = r.goalsFor - r.goalsAgainst;
  r.points = r.won * 3 + r.drawn;
  return r;
}

/** How many recent results the form guide shows. */
export const FORM_LENGTH = 5;

/** The last five outcomes, oldest first (so the newest is on the right). */
export const formOf = (results: readonly ClubResult[]): Outcome[] => results.slice(-FORM_LENGTH).map((r) => r.outcome);

// ─── Expected goals conceded ────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** FPL's `element_type` for goalkeepers. */
const GOALKEEPER = 1;

export type XgcUnavailableReason = "match-in-progress" | "keepers-mismatch";

export type TeamXgc =
  | { available: true; value: number }
  | { available: false; reason: XgcUnavailableReason };

/**
 * A club's expected goals conceded (xGC), from its goalkeepers.
 *
 * FPL gives xGC per player, counting only the minutes the player was on the
 * pitch, and has no team figure. Exactly one goalkeeper is on the pitch at a
 * time, so the club's goalkeepers' xGC added together is the club's xGC. That
 * holds only while the keepers' `goals_conceded` add up to the goals against
 * from the results: in every one of the 200 team-matches recorded for
 * GW1–10 of 2026/27 they did. They won't when an outfield player went in goal,
 * a keeper moved between Premier League clubs mid-season (his season totals
 * move with him), or a match is in progress (player totals update live; the
 * table only counts full-time results). Then this returns unavailable rather
 * than a wrong number.
 */
export function teamXgc(
  elements: readonly Pick<Element, "team" | "element_type" | "goals_conceded" | "expected_goals_conceded">[],
  teamId: number,
  goalsAgainst: number,
  matchInProgress: boolean,
): TeamXgc {
  if (matchInProgress) return { available: false, reason: "match-in-progress" };
  let conceded = 0;
  let xgc = 0;
  for (const e of elements) {
    if (e.team !== teamId || e.element_type !== GOALKEEPER) continue;
    conceded += e.goals_conceded;
    xgc += Number(e.expected_goals_conceded);
  }
  if (conceded !== goalsAgainst) return { available: false, reason: "keepers-mismatch" };
  return { available: true, value: round2(xgc) };
}

export const XGC_UNAVAILABLE_LABELS: { [K in XgcUnavailableReason]: string } = {
  "match-in-progress": "Not shown while the club has a match in progress",
  "keepers-mismatch": "Not shown: the club's goalkeepers' goals conceded don't match its results",
};

// ─── League table ───────────────────────────────────────────────────────────

export interface TableRow extends ClubRecord {
  club: Club;
  /** League position. Clubs level on every tie-breaker share it. */
  position: number;
  /** True when another club has the same position. */
  shared: boolean;
  form: Outcome[];
  xgc: TeamXgc;
}

export interface LeagueTable {
  rows: TableRow[];
  /** Results counted. */
  results: number;
  /** Of those, results at full time that FPL hasn't confirmed yet. */
  provisional: number;
  /** Matches in progress when the snapshot was taken (not counted). */
  inProgress: number;
  /**
   * Every club has played every other twice. From then on the Premier League's
   * end-of-season tie-breakers (head-to-head) apply.
   */
  seasonComplete: boolean;
}

/** Points, goal difference, goals scored: the Premier League's in-season order. */
const compareRecords = (a: ClubRecord, b: ClubRecord) =>
  b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;

interface HeadToHead {
  points: number;
  awayGoals: number;
}

/** Points and away goals in the results between the clubs of a tied group. */
function headToHead(group: readonly number[], fixtures: readonly Fixture[]): Map<number, HeadToHead> {
  const ids = new Set(group);
  const out = new Map(group.map((id) => [id, { points: 0, awayGoals: 0 }]));
  for (const f of fixtures) {
    if (!isResult(f) || !ids.has(f.team_h) || !ids.has(f.team_a)) continue;
    const home = out.get(f.team_h)!;
    const away = out.get(f.team_a)!;
    away.awayGoals += f.team_a_score;
    const outcome = outcomeOf(f.team_h_score, f.team_a_score);
    if (outcome === "W") home.points += 3;
    else if (outcome === "L") away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }
  return out;
}

/**
 * The Premier League table from every result in the snapshot.
 *
 * Order (Premier League rules C.4–C.7 and C.17): points, then goal difference,
 * then goals scored. During the season, clubs still level share a position
 * and are listed alphabetically. Once the season is complete, clubs still level
 * are separated by points and then away goals in the matches between them; if
 * they are still level the rules call for a play-off, which can't be computed,
 * so they share the position.
 */
export function buildLeagueTable(snapshot: SnapshotParts): LeagueTable {
  const { bootstrap, fixtures } = snapshot;
  const clubs = buildClubs(bootstrap.teams);
  const results = fixtures.filter(isResult);
  const inProgress = fixtures.filter(isInProgress);
  const playing = new Set(inProgress.flatMap((f) => [f.team_h, f.team_a]));

  const unranked = clubs.map((club) => {
    const clubRes = clubResults(fixtures, club.id);
    const record = summarise(clubRes);
    return {
      club,
      ...record,
      form: formOf(clubRes),
      xgc: teamXgc(bootstrap.elements, club.id, record.goalsAgainst, playing.has(club.id)),
      h2h: { points: 0, awayGoals: 0 } as HeadToHead,
    };
  });

  const fullSeason = 2 * (clubs.length - 1);
  const seasonComplete = clubs.length > 1 && unranked.every((r) => r.played === fullSeason);

  if (seasonComplete) {
    // Group the clubs level on points, goal difference and goals scored, and
    // work out the head-to-head mini-table within each group.
    const groups = new Map<string, number[]>();
    for (const r of unranked) {
      const key = `${r.points}:${r.goalDifference}:${r.goalsFor}`;
      groups.set(key, [...(groups.get(key) ?? []), r.club.id]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const h2h = headToHead(group, fixtures);
      for (const r of unranked) if (h2h.has(r.club.id)) r.h2h = h2h.get(r.club.id)!;
    }
  }

  const compareRanked = (a: (typeof unranked)[number], b: (typeof unranked)[number]) =>
    compareRecords(a, b) || (seasonComplete ? b.h2h.points - a.h2h.points || b.h2h.awayGoals - a.h2h.awayGoals : 0);

  const sorted = [...unranked].sort((a, b) => compareRanked(a, b) || a.club.name.localeCompare(b.club.name, "en-GB"));

  const rows: TableRow[] = [];
  sorted.forEach((r, i) => {
    const tiedWithPrevious = i > 0 && compareRanked(sorted[i - 1], r) === 0;
    const position = tiedWithPrevious ? rows[i - 1].position : i + 1;
    const tiedWithNext = i < sorted.length - 1 && compareRanked(r, sorted[i + 1]) === 0;
    const { h2h: _h2h, ...row } = r;
    void _h2h;
    rows.push({ ...row, position, shared: tiedWithPrevious || tiedWithNext });
  });

  return {
    rows,
    results: results.length,
    provisional: results.filter((f) => !f.finished).length,
    inProgress: inProgress.length,
    seasonComplete,
  };
}

// ─── Club page ──────────────────────────────────────────────────────────────

export interface Opponent {
  id: number;
  name: string;
  shortName: string;
  path: string;
}

export interface ClubResultView extends ClubResult {
  opponent: Opponent;
}

export interface InProgressMatch {
  fixtureId: number;
  gameweek: number | null;
  kickoff: string | null;
  home: boolean;
  opponent: Opponent;
  /** The score when the snapshot was taken. */
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface UpcomingFixture {
  fixtureId: number;
  /** Null while the fixture is postponed and not yet rescheduled. */
  gameweek: number | null;
  kickoff: string | null;
  home: boolean;
  opponent: Opponent;
  /** FPL's fixture difficulty rating for this club (1 easiest, 5 hardest). */
  difficulty: number;
}

/** One gameweek of the next-fixtures strip: empty for a blank, two for a double. */
export interface FixtureWeek {
  gameweek: number;
  fixtures: UpcomingFixture[];
}

export interface ClubPlayer {
  id: number;
  name: string;
  fullName: string;
  position: string;
  positionId: number;
  totalPoints: number;
  form: number;
  price: number;
  selectedByPercent: number;
  minutes: number;
  availability: PlayerRow["availability"];
}

export interface ClubPage {
  club: Club;
  /** The club's row of the league table (position, record, form, xGC). */
  row: TableRow;
  /** How many clubs are in the table (for "4th of 20"). */
  clubs: number;
  /** Newest first. */
  results: ClubResultView[];
  inProgress: InProgressMatch[];
  home: ClubRecord;
  away: ClubRecord;
  /** Every fixture still to play, in kickoff order (postponed ones without a date last). */
  upcoming: UpcomingFixture[];
  /** The next `FIXTURE_STRIP_LENGTH` gameweeks from the first one the club still has to play. */
  nextWeeks: FixtureWeek[];
  /** Mean difficulty over the strip (a double counts twice), or null with no fixtures in it. */
  nextWeeksDifficulty: number | null;
  topPlayers: ClubPlayer[];
}

/** Gameweeks in the club page's next-fixtures strip (the Fixtures page's default range is the same length). */
export const FIXTURE_STRIP_LENGTH = 6;

/** Players listed on a club page. */
export const TOP_PLAYERS_LENGTH = 10;

/**
 * The club's players by FPL points, then form, then price (which orders them
 * before a ball is kicked, when everyone has 0), top `TOP_PLAYERS_LENGTH`.
 * Players FPL marks unavailable (`u`: left the club or out on loan) are left out,
 * since FPL managers can't usefully pick them.
 */
export function topPlayers(
  bootstrap: Pick<Bootstrap, "teams" | "element_types" | "elements">,
  teamId: number,
  limit = TOP_PLAYERS_LENGTH,
): ClubPlayer[] {
  const elements = bootstrap.elements.filter((e) => e.team === teamId && e.status !== "u");
  return buildPlayerRows({ ...bootstrap, elements })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.form - a.form || b.price - a.price || a.id - b.id)
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      fullName: p.fullName,
      position: p.position,
      positionId: p.positionId,
      totalPoints: p.totalPoints,
      form: p.form,
      price: p.price,
      selectedByPercent: p.selectedByPercent,
      minutes: p.minutes,
      availability: p.availability,
    }));
}

/** Mean difficulty of every fixture in the weeks (a double counts twice), or null with none. */
export function averageFixtureDifficulty(weeks: readonly FixtureWeek[]): number | null {
  const all = weeks.flatMap((w) => w.fixtures);
  return all.length ? round2(all.reduce((sum, f) => sum + f.difficulty, 0) / all.length) : null;
}

/** The club page for a slug, or null if no club has it. */
export function buildClubPage(snapshot: SnapshotParts, slug: string, table = buildLeagueTable(snapshot)): ClubPage | null {
  const row = table.rows.find((r) => r.club.slug === slug);
  if (!row) return null;
  const { club } = row;
  const { bootstrap, fixtures } = snapshot;

  const opponents = new Map(
    table.rows.map(({ club: c }) => [c.id, { id: c.id, name: c.name, shortName: c.shortName, path: c.path }]),
  );
  const opponent = (id: number): Opponent => opponents.get(id) ?? { id, name: "—", shortName: "—", path: TEAMS_PATH };

  const results = clubResults(fixtures, club.id);
  const ours = fixtures.filter((f) => f.team_h === club.id || f.team_a === club.id).sort(byKickoff);

  const upcoming: UpcomingFixture[] = ours.filter(isUpcoming).map((f) => {
    const home = f.team_h === club.id;
    return {
      fixtureId: f.id,
      gameweek: f.event,
      kickoff: f.kickoff_time,
      home,
      opponent: opponent(home ? f.team_a : f.team_h),
      difficulty: home ? f.team_h_difficulty : f.team_a_difficulty,
    };
  });
  // Postponed fixtures (no gameweek, usually no date) go last.
  upcoming.sort((a, b) => Number(a.gameweek === null) - Number(b.gameweek === null));

  const lastGameweek = Math.max(0, ...bootstrap.events.map((e) => e.id));
  const scheduled = upcoming.filter((f) => f.gameweek !== null);
  const firstWeek = scheduled.length ? Math.min(...scheduled.map((f) => f.gameweek!)) : null;
  const nextWeeks: FixtureWeek[] =
    firstWeek === null
      ? []
      : Array.from({ length: Math.min(FIXTURE_STRIP_LENGTH, lastGameweek - firstWeek + 1) }, (_, i) => ({
          gameweek: firstWeek + i,
          fixtures: scheduled.filter((f) => f.gameweek === firstWeek + i),
        }));

  return {
    club,
    row,
    clubs: table.rows.length,
    results: results.map((r) => ({ ...r, opponent: opponent(r.opponentId) })).reverse(),
    inProgress: ours.filter(isInProgress).map((f) => {
      const home = f.team_h === club.id;
      return {
        fixtureId: f.id,
        gameweek: f.event,
        kickoff: f.kickoff_time,
        home,
        opponent: opponent(home ? f.team_a : f.team_h),
        goalsFor: home ? f.team_h_score : f.team_a_score,
        goalsAgainst: home ? f.team_a_score : f.team_h_score,
      };
    }),
    home: summarise(results.filter((r) => r.home)),
    away: summarise(results.filter((r) => !r.home)),
    upcoming,
    nextWeeks,
    nextWeeksDifficulty: averageFixtureDifficulty(nextWeeks),
    topPlayers: topPlayers(bootstrap, club.id),
  };
}

// ─── Text ───────────────────────────────────────────────────────────────────

const matchDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Sat 23 Aug" in UK time (fixed, so the static page is the same wherever it's built); "TBC" with no date. */
export function formatMatchDate(iso: string | null): string {
  return iso ? matchDateFormat.format(new Date(iso)) : "TBC";
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as { [k: number]: string })[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "4th" or "joint 4th". */
export const positionLabel = (row: Pick<TableRow, "position" | "shared">) =>
  `${row.shared ? "joint " : ""}${ordinal(row.position)}`;

/** "W 2–1 v LIV (H)" style text for screen readers and titles: "Won 2–1 at home to Liverpool". */
export function describeResult(r: Pick<ClubResultView, "outcome" | "goalsFor" | "goalsAgainst" | "home" | "opponent">): string {
  const verb = r.outcome === "W" ? "Won" : r.outcome === "L" ? "Lost" : "Drew";
  return `${verb} ${r.goalsFor}–${r.goalsAgainst} ${r.home ? "at home to" : "away at"} ${r.opponent.name}`;
}

const OUTCOME_WORDS: { [K in Outcome]: string } = { W: "won", D: "drew", L: "lost" };

/** "Last 5, oldest first: won, won, drew, lost, won" for a form guide's label. */
export function describeForm(form: readonly Outcome[]): string {
  if (form.length === 0) return "No results yet";
  return `Last ${form.length}, oldest first: ${form.map((o) => OUTCOME_WORDS[o]).join(", ")}`;
}

/** "2.6 fewer than expected", "1.1 more than expected", "as many as expected" (goals conceded vs xGC). */
export function concededVsExpected(goalsAgainst: number, xgc: number): string {
  const diff = Math.round((goalsAgainst - xgc) * 10) / 10;
  if (diff === 0) return "as many as expected";
  return `${Math.abs(diff).toFixed(1)} ${diff < 0 ? "fewer" : "more"} than expected`;
}

/** The meta description for a club page. */
export function clubDescription(page: Pick<ClubPage, "club" | "row" | "upcoming">): string {
  const { club, row } = page;
  const next = page.upcoming[0];
  const nextText = next
    ? ` Next: ${next.opponent.name} (${next.home ? "H" : "A"})${next.gameweek ? ` in GW${next.gameweek}` : ""}.`
    : "";
  const standing =
    row.played === 0
      ? `${club.fullName} in Fantasy Premier League: no results yet this season.`
      : `${club.fullName} are ${positionLabel(row)} in the Premier League with ${row.points} ${row.points === 1 ? "point" : "points"} from ${row.played} ${row.played === 1 ? "game" : "games"} (W${row.won} D${row.drawn} L${row.lost}).`;
  return `${standing}${nextText} Results, clean sheets, fixture difficulty and the club's top FPL players.`;
}
