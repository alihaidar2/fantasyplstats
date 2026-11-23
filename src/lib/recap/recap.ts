// The shape of a recap: what the agent submits (a draft) and what gets saved
// to content/recaps/<season>/gw<N>.json once it has passed the checker.

import { z } from "zod";

/** Length limits. The checker enforces them and reports each breach in words. */
export const RECAP_LIMITS = {
  headlineMinChars: 10,
  headlineMaxChars: 90,
  minParagraphs: 2,
  maxParagraphs: 5,
  paragraphMaxChars: 700,
  minWords: 80,
  maxWords: 320,
  minClaims: 3,
  maxClaims: 24,
  claimMaxChars: 240,
  maxEvidencePerClaim: 5,
} as const;

export type RecapLimits = { [Limit in keyof typeof RECAP_LIMITS]: number };

/** One checkable statement from the recap, with the tool results that back it up. */
export const claimSchema = z.object({
  text: z.string().min(1).describe("One factual statement made in the recap, in a single sentence."),
  evidence: z
    .array(z.string().regex(/^r\d+$/, 'expected a result id such as "r3"'))
    .min(1)
    .describe('The ids of the tool results this statement relies on, e.g. ["r2", "r5"].'),
});

/** What the agent hands to submit_recap. Limits are the checker's job, so its messages can say what to fix. */
export const recapDraftSchema = z.object({
  headline: z.string().describe("A headline in sentence case, without a full stop."),
  paragraphs: z.array(z.string()).describe("The recap, as plain-text paragraphs."),
  claims: z
    .array(claimSchema)
    .describe("Every number in the recap must appear in a claim, and every claim must cite the results it came from."),
});

/** One tool call and what it returned. */
export const evidenceEntrySchema = z.object({
  /** "r1", "r2", ... in call order. */
  id: z.string().regex(/^r\d+$/),
  tool: z.string().min(1),
  input: z.unknown(),
  /** False when the call failed (bad input); a failed call is not evidence. */
  ok: z.boolean(),
  result: z.unknown(),
});

export const checkIssueSchema = z.object({
  /** A stable identifier for the rule, e.g. "number-not-in-evidence". */
  code: z.string().min(1),
  /** "headline", "paragraph 2", "claim 3" or "recap". */
  where: z.string().min(1),
  /** What is wrong and how to fix it, written for the agent. */
  message: z.string().min(1),
});

export const checkReportSchema = z.object({
  passed: z.boolean(),
  issues: z.array(checkIssueSchema),
  /** How much was verified, for the run log. */
  numbersChecked: z.number().int().nonnegative(),
  namesChecked: z.number().int().nonnegative(),
});

export const RECAP_VERSION = 1;

/** A saved recap. */
export const recapSchema = z.object({
  version: z.literal(RECAP_VERSION),
  /** "2026-27" */
  season: z.string().regex(/^\d{4}-\d{2}$/),
  gameweek: z.number().int().min(1).max(38),
  headline: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  claims: z.array(claimSchema),
  /** Every tool call the agent made, in order. */
  evidence: z.array(evidenceEntrySchema),
  checks: checkReportSchema,
  /** The model that wrote it, or "hand-written". */
  model: z.string().min(1),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  timing: z.object({
    startedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
  }),
  generatedAt: z.iso.datetime(),
});

export type Claim = z.infer<typeof claimSchema>;
export type RecapDraft = z.infer<typeof recapDraftSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type CheckIssue = z.infer<typeof checkIssueSchema>;
export type CheckReport = z.infer<typeof checkReportSchema>;
export type Recap = z.infer<typeof recapSchema>;
