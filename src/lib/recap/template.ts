// The fallback recap: a plain, deterministic write-up built from two tool
// results (gameweek_summary and top_performers), for when the model's recap
// fails the checker twice or the run hits a limit. It is dull on purpose:
// every sentence is a figure copied from a result, phrased the way the
// checker reads it, so it passes for any gameweek.

import { z } from "zod";
import { RECAP_LIMITS, type Claim, type EvidenceEntry, type RecapDraft } from "./recap";

/** The tool calls the template is built from, in order. */
export const TEMPLATE_CALLS = [
  { tool: "gameweek_summary", input: {} },
  { tool: "top_performers", input: { limit: 5 } },
] as const;

const scored = z.object({ player: z.string(), team: z.string(), points: z.number() });

const summarySchema = z.object({
  gameweek: z.number(),
  managers: z.object({ averageScore: z.number(), highestScore: z.number().optional() }),
  matches: z.array(z.object({ home: z.string(), away: z.string(), score: z.string().optional() })),
  goals: z.number(),
  topScorer: scored.optional(),
  mostCaptained: scored.optional(),
  mostTransferredIn: scored.optional(),
});

const performersSchema = z.object({ players: z.array(scored) });

const points = (n: number) => `${n} ${Math.abs(n) === 1 ? "point" : "points"}`;

/** How many results one claim lists, so it stays under the claim length limit. */
const RESULTS_PER_CLAIM = 3;
const MAX_RESULTS = 12;
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
  const paragraphs: string[] = [];
  const claims: Claim[] = [];
  /** Adds a paragraph whose sentences are each a claim citing one result. */
  const paragraph = (sentences: { text: string; from: EvidenceEntry }[]) => {
    if (sentences.length === 0) return;
    paragraphs.push(sentences.map((x) => x.text).join(" "));
    for (const x of sentences) claims.push({ text: x.text, evidence: [x.from.id] });
  };

  // 1. The top scores.
  const top = s.topScorer ?? performers.data.players[0];
  const scorers: { text: string; from: EvidenceEntry }[] = [];
  if (top) {
    const from = s.topScorer ? summaryEntry : performersEntry;
    scorers.push({ text: `${top.player} of ${top.team} was the top scorer of Gameweek ${s.gameweek} with ${points(top.points)}.`, from });
  }
  for (const p of performers.data.players.filter((p) => p.player !== top?.player).slice(0, MAX_OTHER_SCORERS)) {
    scorers.push({ text: `${p.player} of ${p.team} returned ${points(p.points)}.`, from: performersEntry });
  }
  paragraph(scorers);

  // 2. Managers, the captain and the big transfer.
  const managers: { text: string; from: EvidenceEntry }[] = [
    { text: `The average manager scored ${points(s.managers.averageScore)}.`, from: summaryEntry },
  ];
  if (s.managers.highestScore !== undefined) {
    managers.push({ text: `The highest manager score of the gameweek was ${points(s.managers.highestScore)}.`, from: summaryEntry });
  }
  if (s.mostCaptained) {
    managers.push({
      text: `${s.mostCaptained.player} was the most-captained player and returned ${points(s.mostCaptained.points)}.`,
      from: summaryEntry,
    });
  }
  if (s.mostTransferredIn) {
    managers.push({
      text: `${s.mostTransferredIn.player} was the most-transferred-in player and returned ${points(s.mostTransferredIn.points)}.`,
      from: summaryEntry,
    });
  }
  paragraph(managers);

  // 3. The results.
  const results = s.matches.filter((m) => m.score !== undefined).slice(0, MAX_RESULTS);
  // The summary gives no count of matches, so the sentence doesn't either.
  const matches: { text: string; from: EvidenceEntry }[] = [
    { text: `There were ${s.goals} ${s.goals === 1 ? "goal" : "goals"} scored in the gameweek.`, from: summaryEntry },
  ];
  for (let i = 0; i < results.length; i += RESULTS_PER_CLAIM) {
    const group = results.slice(i, i + RESULTS_PER_CLAIM).map((m) => `${m.home} ${m.score} ${m.away}`);
    matches.push({ text: `${i === 0 ? "The results included" : "There was also"} ${list(group)}.`, from: summaryEntry });
  }
  paragraph(matches);

  const headline = top
    ? `${top.player} tops Gameweek ${s.gameweek} with ${points(top.points)}`
    : `Gameweek ${s.gameweek} in numbers`;
  return { headline: headline.slice(0, RECAP_LIMITS.headlineMaxChars), paragraphs, claims };
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
