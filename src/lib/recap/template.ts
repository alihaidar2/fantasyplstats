// The fallback recap: plain, deterministic cards built from two tool results
// (gameweek_summary and top_performers), for when the model's recap fails the
// checker twice or the run hits a limit. It is dull on purpose: every figure
// is copied from a result into the card field made for it, so it passes for
// any gameweek.

import { z } from "zod";
import type { RecapCard } from "./cards";
import { RECAP_LIMITS, type EvidenceEntry, type RecapDraft } from "./recap";

/** The tool calls the template is built from, in order. */
export const TEMPLATE_CALLS = [
  { tool: "gameweek_summary", input: {} },
  { tool: "top_performers", input: { limit: 5 } },
] as const;

const scored = z.object({ player: z.string(), ref: z.string().regex(/^p\d+$/), team: z.string(), points: z.number() });

const summarySchema = z.object({
  gameweek: z.number(),
  managers: z.object({ averageScore: z.number(), highestScore: z.number().optional() }),
  matches: z.array(
    z.object({
      home: z.string(),
      away: z.string(),
      score: z.string().optional(),
      scorers: z.array(z.object({ goals: z.number() })).optional(),
    }),
  ),
  matchCount: z.number().optional(),
  goals: z.number(),
  topScorer: scored.optional(),
  mostCaptained: scored.optional(),
  mostTransferredIn: scored.optional(),
});

const performersSchema = z.object({ players: z.array(scored) });

const points = (n: number) => `${n} ${Math.abs(n) === 1 ? "point" : "points"}`;

/** The matches card's results: the most goals first. */
const MAX_MATCHES = 3;
/** Players on the "close behind" card, after the top scorer. */
const MAX_OTHER_SCORERS = 3;

/**
 * Builds the template from the evidence log: the latest successful
 * gameweek_summary and top_performers results. Returns null when either is
 * missing.
 */
export function buildTemplateRecap(evidence: readonly EvidenceEntry[]): RecapDraft | null {
  const latest = (tool: string) => evidence.findLast((e) => e.ok && e.tool === tool);
  const summaryEntry = latest("gameweek_summary");
  const performersEntry = latest("top_performers");
  if (!summaryEntry || !performersEntry) return null;
  const summary = summarySchema.safeParse(summaryEntry.result);
  const performers = performersSchema.safeParse(performersEntry.result);
  if (!summary.success || !performers.success) return null;

  const s = summary.data;
  const fromSummary = [summaryEntry.id];
  const fromPerformers = [performersEntry.id];
  const cards: RecapCard[] = [];

  // 1. The gameweek in numbers.
  cards.push({
    type: "numbers",
    items: [
      { value: String(s.managers.averageScore), label: "average score" },
      { value: String(s.goals), label: "goals" },
      ...(s.matchCount !== undefined ? [{ value: String(s.matchCount), label: "matches" }] : []),
    ],
    evidence: fromSummary,
  });

  // 2. The captain.
  if (s.mostCaptained) {
    cards.push({ type: "captaincy", player: s.mostCaptained.player, ref: s.mostCaptained.ref, points: s.mostCaptained.points, evidence: fromSummary });
  }

  // 3. The top scorer, then the next best.
  const top = s.topScorer ?? performers.data.players[0];
  if (top) {
    cards.push({
      type: "players",
      title: "The top scorer",
      players: [{ player: top.player, ref: top.ref, points: top.points }],
      evidence: s.topScorer ? fromSummary : fromPerformers,
    });
  }
  const others = performers.data.players.filter((p) => p.ref !== top?.ref).slice(0, MAX_OTHER_SCORERS);
  if (others.length > 0) {
    cards.push({
      type: "players",
      title: "Close behind",
      players: others.map((p) => ({ player: p.player, ref: p.ref, points: p.points })),
      evidence: fromPerformers,
    });
  }

  // 4. The results with the most goals.
  const goalsIn = (m: (typeof s.matches)[number]) => (m.score ?? "").split("-").reduce((sum, g) => sum + (Number(g) || 0), 0);
  const results = s.matches
    .filter((m) => m.score !== undefined && /^\d{1,2}-\d{1,2}$/.test(m.score))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => goalsIn(b.m) - goalsIn(a.m) || a.i - b.i)
    .slice(0, MAX_MATCHES)
    .map(({ m }) => ({ home: m.home, away: m.away, score: m.score! }));
  if (results.length > 0) {
    cards.push({ type: "matches", title: "The most goals", matches: results, evidence: fromSummary });
  }

  // 5. The transfer market's favourite. gameweek_summary has no net transfers,
  // so it is a note rather than a transfers card.
  if (s.mostTransferredIn) {
    cards.push({
      type: "notes",
      title: "Also worth knowing",
      items: [
        {
          player: s.mostTransferredIn.player,
          ref: s.mostTransferredIn.ref,
          text: "was the most-transferred-in player",
          points: s.mostTransferredIn.points,
        },
        ...(s.managers.highestScore !== undefined
          ? [{ text: `The highest manager score of the gameweek was ${points(s.managers.highestScore)}.` }]
          : []),
      ],
      evidence: fromSummary,
    });
    // A notes card needs two lines.
    const notes = cards.at(-1);
    if (notes?.type === "notes" && notes.items.length < RECAP_LIMITS.notesMin) cards.pop();
  }

  const headline = top
    ? `${top.player} tops Gameweek ${s.gameweek} with ${points(top.points)}`
    : `Gameweek ${s.gameweek} in numbers`;
  return { headline: headline.slice(0, RECAP_LIMITS.headlineMaxChars), cards: cards.slice(0, RECAP_LIMITS.maxCards) };
}
