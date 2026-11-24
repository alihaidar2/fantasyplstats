// The shape of a recap: what the agent submits (a draft) and what gets saved
// to content/recaps/<season>/gw<N>.json once it has passed the checker.
//
// Version 2 (current): a headline and story cards (cards.ts). Version 1: a
// headline and paragraphs with claims, as the first published recaps were
// written. Both still load, so a version 1 recap keeps rendering until it is
// regenerated.

import { z } from "zod";
import { CARD_LIMITS, recapCardSchema, type CardLimits } from "./cards";

/** Limits on the headline, shared by both versions. */
export const HEADLINE_LIMITS = { headlineMinChars: 10, headlineMaxChars: 90 } as const;

/** Length limits of a version 2 (cards) recap. The checker enforces them and reports each breach in words. */
export const RECAP_LIMITS = { ...HEADLINE_LIMITS, ...CARD_LIMITS } as const;

export type RecapLimits = { headlineMinChars: number; headlineMaxChars: number } & CardLimits;

/** Length limits of a version 1 (paragraphs) recap. */
export const PARAGRAPH_RECAP_LIMITS = {
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

export type ParagraphRecapLimits = { [Limit in keyof typeof PARAGRAPH_RECAP_LIMITS]: number };

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
  cards: z
    .array(recapCardSchema)
    .describe("4 to 7 story cards, biggest story first. Every figure and name on a card must be in the results it cites."),
});

/** A version 1 draft: paragraphs, and claims that back up each number in them. */
export const paragraphDraftSchema = z.object({
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

/** One attempt by the model at the recap: it ends with a submission, or is cut short. */
export const recapAttemptSchema = z.object({
  attempt: z.number().int().min(1),
  /** "passed" or "failed" is the checker's verdict on what it submitted; "aborted" means it never got that far. */
  outcome: z.enum(["passed", "failed", "aborted"]),
  /** Why it was cut short, e.g. "timeout". Only when aborted. */
  reason: z.string().optional(),
  /** Investigating tool calls made in this attempt (submit_recap is not counted). */
  toolCalls: z.number().int().nonnegative(),
  /** What the checker said about a failed submission. */
  issues: z.array(checkIssueSchema),
});

/** How the agent got to the saved text. Absent from recaps written before the agent logged it. */
export const recapRunSchema = z.object({
  /** "first-try": the first submission passed. "after-retry": the second did. "fallback": the template was used. */
  outcome: z.enum(["first-try", "after-retry", "fallback"]),
  /** True when the text is the deterministic template rather than the model's writing. */
  fallback: z.boolean(),
  /** Why the template was used. */
  fallbackReason: z.string().optional(),
  attempts: z.array(recapAttemptSchema),
  /** Requests made to the model. */
  modelCalls: z.number().int().nonnegative(),
  /** False when the model has no entry in the price table, so costUsd is 0 rather than known. */
  priced: z.boolean(),
  limits: z.object({
    maxToolCallsPerAttempt: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),
});

export const RECAP_VERSION = 2;

/** What every saved recap has, whatever its version. */
const savedRecapBase = {
  /** "2026-27" */
  season: z.string().regex(/^\d{4}-\d{2}$/),
  gameweek: z.number().int().min(1).max(38),
  headline: z.string().min(1),
  /** Every tool call the agent made, in order. */
  evidence: z.array(evidenceEntrySchema),
  checks: checkReportSchema,
  /** The model that wrote it, or "hand-written". */
  model: z.string().min(1),
  usage: z.object({
    /** Every input token, including those read from or written to the prompt cache. */
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    /** Every logged tool call: the length of `evidence`. */
    toolCalls: z.number().int().nonnegative(),
    /** The parts of inputTokens that were cache reads and cache writes, which are priced differently. */
    cacheReadInputTokens: z.number().int().nonnegative().optional(),
    cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  }),
  costUsd: z.number().nonnegative(),
  timing: z.object({
    startedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
  }),
  generatedAt: z.iso.datetime(),
  /** Attempts, and whether the template fallback was used. Optional: older recaps don't have it. */
  run: recapRunSchema.optional(),
};

/** A saved version 1 recap: paragraphs and claims. Still read, never written. */
export const paragraphRecapSchema = z.object({
  version: z.literal(1),
  ...savedRecapBase,
  paragraphs: z.array(z.string().min(1)).min(1),
  claims: z.array(claimSchema),
});

/** A saved version 2 recap: story cards, each citing the results it was built from. */
export const cardRecapSchema = z.object({
  version: z.literal(RECAP_VERSION),
  ...savedRecapBase,
  cards: z.array(recapCardSchema).min(1),
});

/** A saved recap of either version. */
export const recapSchema = z.discriminatedUnion("version", [paragraphRecapSchema, cardRecapSchema]);

export type Claim = z.infer<typeof claimSchema>;
export type RecapDraft = z.infer<typeof recapDraftSchema>;
export type ParagraphDraft = z.infer<typeof paragraphDraftSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type CheckIssue = z.infer<typeof checkIssueSchema>;
export type CheckReport = z.infer<typeof checkReportSchema>;
export type RecapAttempt = z.infer<typeof recapAttemptSchema>;
export type RecapRun = z.infer<typeof recapRunSchema>;
export type Recap = z.infer<typeof recapSchema>;
export type ParagraphRecap = z.infer<typeof paragraphRecapSchema>;
export type CardRecap = z.infer<typeof cardRecapSchema>;
