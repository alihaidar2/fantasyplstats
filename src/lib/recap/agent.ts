// The recap agent: a model investigates one gameweek through the tools,
// submits a recap, and the checker decides whether it stands.
//
//   attempt 1: the model calls tools until it calls submit_recap
//   passed  -> done ("first-try")
//   failed  -> attempt 2: the checker's messages go back; it may call more
//              tools, then submits again
//   passed  -> done ("after-retry")
//   failed  -> the deterministic template (template.ts) ("fallback")
//
// Hitting a limit (too many turns without submitting, the overall timeout, a
// refusal) also ends in the template, so a run always produces a recap and
// says how it got there. A model error (bad credentials, an API outage) is
// not a reason to publish a template: it is thrown to the caller.

import type { GameweekContext } from "./context";
import {
  NO_USAGE,
  addUsage,
  type ModelMessage,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
  type RecapModel,
  type UserBlock,
} from "./model";
import { MODEL_PRICES_USD_PER_MTOK, costOfRequest, roundUsd, type ModelPrices } from "./pricing";
import { RETRY_INSTRUCTION, recapKickoffMessage, recapSystemPrompt } from "./prompt";
import {
  RECAP_VERSION,
  recapDraftSchema,
  recapSchema,
  type CheckIssue,
  type CheckReport,
  type EvidenceEntry,
  type Recap,
  type RecapAttempt,
  type RecapDraft,
} from "./recap";
import { createRecapSession, toolDefinitions, type RecapSession } from "./session";
import { TEMPLATE_CALLS, buildTemplateRecap } from "./template";
import { RECAP_TOOLS, type RecapTool } from "./tools";

export interface AgentLimits {
  /** Investigating tool calls per attempt. Past it, calls are refused and the model is told to submit. */
  maxToolCallsPerAttempt: number;
  /** max_tokens for each model request. */
  maxOutputTokens: number;
  /** For the whole run, both attempts included. */
  timeoutMs: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxToolCallsPerAttempt: 15,
  maxOutputTokens: 4000,
  timeoutMs: 180_000,
};

/** Model turns allowed in one attempt beyond its tool calls: room to be told to submit, not to loop for ever. */
const SPARE_TURNS = 4;

export const SUBMIT_TOOL = "submit_recap";

export interface RecapAgentOptions {
  context: GameweekContext;
  model: RecapModel;
  limits?: Partial<AgentLimits>;
  tools?: readonly RecapTool[];
  prices?: Readonly<Record<string, ModelPrices>>;
  /** The clock, for tests. */
  now?: () => Date;
}

class RunTimeout extends Error {}

/** Why an attempt ended without the checker passing it. */
type Stop = { kind: "failed"; issues: CheckIssue[] } | { kind: "aborted"; reason: string };

const resultText = (entry: EvidenceEntry) =>
  entry.ok
    ? `Result id: ${entry.id}\n${JSON.stringify(entry.result)}`
    : `${(entry.result as { error?: string }).error ?? "The call failed."} (This call returned no result, so it cannot be cited.)`;

export async function runRecapAgent(options: RecapAgentOptions): Promise<Recap> {
  const { context, model } = options;
  const limits: AgentLimits = { ...DEFAULT_AGENT_LIMITS, ...options.limits };
  const now = options.now ?? (() => new Date());
  const prices = options.prices ?? MODEL_PRICES_USD_PER_MTOK;
  const tools = options.tools ?? RECAP_TOOLS;
  const session = createRecapSession(context, tools);
  const definitions = toolDefinitions(tools);
  const system = recapSystemPrompt({ maxToolCalls: limits.maxToolCallsPerAttempt });

  const startedAt = now();
  const deadline = Date.now() + limits.timeoutMs;
  const controller = new AbortController();

  let usage: ModelUsage = NO_USAGE;
  let cost = 0;
  let priced = true;
  let modelCalls = 0;

  /** One model request, bounded by what is left of the run's timeout. */
  const send = async (messages: readonly ModelMessage[]): Promise<ModelResponse> => {
    const left = deadline - Date.now();
    if (left <= 0) throw new RunTimeout();
    const request: ModelRequest = {
      system,
      messages,
      tools: definitions,
      maxOutputTokens: limits.maxOutputTokens,
      signal: controller.signal,
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        model.send(request),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new RunTimeout());
          }, left);
        }),
      ]);
      modelCalls++;
      usage = addUsage(usage, response.usage);
      const requestCost = costOfRequest(model.id, response.usage, prices);
      if (requestCost === null) priced = false;
      else cost += requestCost;
      return response;
    } catch (error) {
      // The SDK reports our own abort as an error of its own; it is still the timeout.
      if (controller.signal.aborted) throw new RunTimeout();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const messages: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: recapKickoffMessage(context) }] },
  ];
  const attempts: RecapAttempt[] = [];
  let accepted: { draft: RecapDraft; checks: CheckReport } | null = null;
  let fallbackReason: string | undefined;

  /**
   * Runs the conversation until the model submits a recap the checker can
   * judge, or the attempt is cut short. Leaves `messages` ending with the
   * user turn that answers the submission, so a retry can simply continue.
   */
  const attempt = async (number: number): Promise<Stop | null> => {
    let toolCalls = 0;
    const done = (stop: Stop | null): Stop | null => {
      attempts.push({
        attempt: number,
        outcome: stop === null ? "passed" : stop.kind,
        ...(stop?.kind === "aborted" ? { reason: stop.reason } : {}),
        toolCalls,
        issues: stop?.kind === "failed" ? stop.issues : [],
      });
      return stop;
    };

    for (let turn = 0; turn < limits.maxToolCallsPerAttempt + SPARE_TURNS; turn++) {
      let response: ModelResponse;
      try {
        response = await send(messages);
      } catch (error) {
        if (error instanceof RunTimeout) return done({ kind: "aborted", reason: "timeout" });
        throw error;
      }
      messages.push({ role: "assistant", content: response.content });
      if (response.stopReason === "refusal") return done({ kind: "aborted", reason: "the model refused" });

      const calls = response.content.filter((b) => b.type === "tool_use");
      const cutOff = response.stopReason === "max_tokens";
      if (calls.length === 0) {
        const text = cutOff
          ? "Your reply was cut off at the output limit. Be brief, and call submit_recap with the finished recap."
          : "Finish by calling submit_recap with the recap. Do not write it as a message.";
        messages.push({ role: "user", content: [{ type: "text", text }] });
        continue;
      }

      const results: UserBlock[] = [];
      let verdict: Stop | null | undefined;
      for (const call of calls) {
        const reply = (content: string, isError = false) =>
          results.push({ type: "tool_result", toolUseId: call.id, content, ...(isError ? { isError } : {}) });

        if (verdict !== undefined) {
          reply("Not run: it came after submit_recap in the same turn.", true);
        } else if (cutOff) {
          // A tool call in a truncated reply may be missing part of its input.
          reply("Not run: your reply was cut off at the output limit. Make the call again, more briefly.", true);
        } else if (call.name === SUBMIT_TOOL) {
          const draft = recapDraftSchema.safeParse(call.input);
          const entry = session.call(SUBMIT_TOOL, call.input);
          if (!draft.success || !entry.ok) {
            // Not a recap the checker can read (a missing field, a malformed id): say so and let it resubmit.
            reply(resultText(entry), true);
            continue;
          }
          const checks = session.check(draft.data);
          if (checks.passed) {
            accepted = { draft: draft.data, checks };
            verdict = null;
            reply("Accepted.");
          } else {
            verdict = { kind: "failed", issues: checks.issues };
            const problems = checks.issues.map((issue, i) => `${i + 1}. ${issue.where}: ${issue.message}`).join("\n");
            reply(`The checker found ${checks.issues.length} problem(s):\n${problems}`, true);
          }
        } else if (toolCalls >= limits.maxToolCallsPerAttempt) {
          reply(
            `Not run: you have used all ${limits.maxToolCallsPerAttempt} tool calls. Call submit_recap now, using the results you already have.`,
            true,
          );
        } else {
          toolCalls++;
          const entry = session.call(call.name, call.input);
          reply(resultText(entry), !entry.ok);
        }
      }
      if (verdict !== undefined && verdict !== null && number === 1) {
        results.push({ type: "text", text: RETRY_INSTRUCTION });
      }
      messages.push({ role: "user", content: results });
      if (verdict !== undefined) return done(verdict);
    }
    return done({ kind: "aborted", reason: "the model did not submit a recap within its turns" });
  };

  const first = await attempt(1);
  if (first?.kind === "failed") {
    const second = await attempt(2);
    if (second) fallbackReason = second.kind === "failed" ? "the checker rejected both submissions" : second.reason;
  } else if (first) {
    fallbackReason = first.reason;
  }

  let draft: RecapDraft;
  let checks: CheckReport;
  // (Assigned inside a closure, which TypeScript's narrowing can't follow.)
  const passed = accepted as { draft: RecapDraft; checks: CheckReport } | null;
  if (passed) {
    ({ draft, checks } = passed);
  } else {
    ({ draft, checks } = templateFallback(session));
  }

  const finishedAt = now();
  const recap: Recap = {
    version: RECAP_VERSION,
    season: context.season,
    gameweek: context.gameweek,
    headline: draft.headline,
    paragraphs: draft.paragraphs,
    claims: draft.claims,
    evidence: [...session.evidence],
    checks,
    model: model.id,
    usage: {
      inputTokens: usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      toolCalls: session.evidence.length,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    },
    costUsd: roundUsd(cost),
    timing: {
      startedAt: startedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    },
    generatedAt: finishedAt.toISOString(),
    run: {
      outcome: passed ? (attempts.length === 1 ? "first-try" : "after-retry") : "fallback",
      fallback: !passed,
      ...(fallbackReason !== undefined && !passed ? { fallbackReason } : {}),
      attempts,
      modelCalls,
      priced,
      limits,
    },
  };
  return recapSchema.parse(recap);
}

/**
 * Makes the template's own tool calls (logged like any other, so its claims
 * cite real result ids) and builds the template from them. The template is
 * written to pass the checker; if a gameweek ever breaks it, the report says
 * so and `checks.passed` is false, which a publisher must refuse.
 */
function templateFallback(session: RecapSession): { draft: RecapDraft; checks: CheckReport } {
  const entries = TEMPLATE_CALLS.map((call) => session.call(call.tool, call.input));
  const draft = buildTemplateRecap(entries);
  if (!draft) {
    throw new Error(
      `The fallback recap could not be built: ${entries.map((e) => `${e.tool} ${e.ok ? "ok" : "failed"}`).join(", ")}.`,
    );
  }
  return { draft, checks: session.check(draft) };
}
