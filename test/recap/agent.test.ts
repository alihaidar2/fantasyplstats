import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_LIMITS, runRecapAgent } from "../../src/lib/recap/agent";
import { anthropicModel } from "../../src/lib/recap/anthropic-model";
import {
  scriptedModel,
  toolResultsOf,
  type ModelMessage,
  type ModelRequest,
  type RecapModel,
  type ScriptedReply,
} from "../../src/lib/recap/model";
import { costOfRequest, pricesFor } from "../../src/lib/recap/pricing";
import { RETRY_INSTRUCTION } from "../../src/lib/recap/prompt";
import { recapSchema, type Recap, type RecapDraft } from "../../src/lib/recap/recap";
import { toolDefinitions } from "../../src/lib/recap/session";
import { loadContext } from "./helpers";

// The agent, driven by scripted models: no network. The script is the
// hand-written sample recap of GW4 (test/fixtures/recap/sample-recap.json):
// replaying its seven tool calls and submitting its text passes the checker.

const sample: Recap = recapSchema.parse(
  JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "recap", "sample-recap.json"), "utf8")),
);
const goodDraft = (): RecapDraft => ({
  headline: sample.headline,
  paragraphs: [...sample.paragraphs],
  claims: sample.claims.map((c) => ({ text: c.text, evidence: [...c.evidence] })),
});
/** The sample with Groß's 17 points written as 19 everywhere: no tool returned a 19 for him. */
const badDraft = (): RecapDraft => JSON.parse(JSON.stringify(goodDraft()).replaceAll("17 points", "19 points"));

const investigate: ScriptedReply = { calls: sample.evidence.map((e) => ({ name: e.tool, input: e.input })) };
const submit = (draft: RecapDraft): ScriptedReply => ({ calls: [{ name: "submit_recap", input: draft }] });

const context = () => loadContext(4);
const userTurns = (request: ModelRequest) => request.messages.filter((m) => m.role === "user");
const lastUserTurn = (request: ModelRequest) => userTurns(request).at(-1) as Extract<ModelMessage, { role: "user" }>;

describe("the recap agent", () => {
  it("returns the model's recap when it passes the checker first time", async () => {
    const model = scriptedModel("scripted", [investigate, submit(goodDraft())]);
    const recap = await runRecapAgent({ context: context(), model });

    expect(recap).toMatchObject({
      version: 1,
      season: "2026-27",
      gameweek: 4,
      headline: sample.headline,
      paragraphs: sample.paragraphs,
      claims: sample.claims,
      model: "scripted",
      checks: { passed: true, issues: [] },
      run: {
        outcome: "first-try",
        fallback: false,
        attempts: [{ attempt: 1, outcome: "passed", toolCalls: 7, issues: [] }],
        modelCalls: 2,
        limits: DEFAULT_AGENT_LIMITS,
      },
    });
    expect(recap.run).not.toHaveProperty("fallbackReason");
    expect(recap.checks).toEqual(sample.checks);
    expect(() => recapSchema.parse(recap)).not.toThrow();
  });

  it("sends the system prompt, every tool and the gameweek, then the results with their ids", async () => {
    const model = scriptedModel("scripted", [investigate, submit(goodDraft())]);
    await runRecapAgent({ context: context(), model, limits: { maxOutputTokens: 1234 } });

    const [first, second] = model.requests;
    expect(first.system).toMatch(/only from tools/);
    expect(first.system).toMatch(/UK English/);
    expect(first.system).toMatch(/at most 15 tool calls/);
    expect(first.maxOutputTokens).toBe(1234);
    expect(first.tools).toEqual(toolDefinitions());
    expect(first.tools.map((t) => t.name)).toContain("submit_recap");
    expect(first.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Write the recap for Gameweek 4 of the 2026/27 Premier League season. Start with gameweek_summary." }],
      },
    ]);

    const results = toolResultsOf(second.messages);
    expect(results).toHaveLength(7);
    results.forEach((text, i) => {
      expect(text.startsWith(`Result id: r${i + 1}\n`)).toBe(true);
      expect(JSON.parse(text.slice(text.indexOf("\n") + 1))).toEqual(sample.evidence[i].result);
    });
  });

  it("retries once with the checker's messages, and keeps the second draft when it passes", async () => {
    const model = scriptedModel("scripted", [investigate, submit(badDraft()), submit(goodDraft())]);
    const recap = await runRecapAgent({ context: context(), model });

    expect(recap.run).toMatchObject({ outcome: "after-retry", fallback: false, modelCalls: 3 });
    expect(recap.run!.attempts).toMatchObject([
      { attempt: 1, outcome: "failed", toolCalls: 7 },
      { attempt: 2, outcome: "passed", toolCalls: 0, issues: [] },
    ]);
    expect(recap.run!.attempts[0].issues.length).toBeGreaterThan(0);
    expect(recap.run!.attempts[0].issues.map((i) => i.message).join(" ")).toMatch(/19 points/);
    expect(recap.headline).toBe(sample.headline);
    expect(recap.checks.passed).toBe(true);

    // What the model saw after the rejected draft: the problems, as an error result, and the retry instruction.
    const turn = lastUserTurn(model.requests[2]);
    expect(turn.content[0]).toMatchObject({ type: "tool_result", isError: true });
    const problems = (turn.content[0] as { content: string }).content;
    expect(problems).toMatch(/^The checker found \d+ problem\(s\):\n1\. /);
    expect(problems).toMatch(/19 points/);
    expect(turn.content.at(-1)).toEqual({ type: "text", text: RETRY_INSTRUCTION });
  });

  it("lets the retry call more tools before resubmitting", async () => {
    const model = scriptedModel("scripted", [
      investigate,
      submit(badDraft()),
      { calls: [{ name: "player_story", input: { player: "Groß" } }] },
      submit(goodDraft()),
    ]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(recap.run).toMatchObject({ outcome: "after-retry" });
    expect(recap.run!.attempts[1]).toMatchObject({ outcome: "passed", toolCalls: 1 });
    expect(recap.evidence.map((e) => e.tool).slice(-3)).toEqual(["submit_recap", "player_story", "submit_recap"]);
  });

  it("falls back to the template after a second rejection, and the template passes the checker", async () => {
    const model = scriptedModel("scripted", [investigate, submit(badDraft()), submit(badDraft())]);
    const recap = await runRecapAgent({ context: context(), model });

    expect(recap.run).toMatchObject({
      outcome: "fallback",
      fallback: true,
      fallbackReason: "the checker rejected both submissions",
      modelCalls: 3,
    });
    expect(recap.run!.attempts.map((a) => a.outcome)).toEqual(["failed", "failed"]);
    expect(recap.run!.attempts[1].issues.length).toBeGreaterThan(0);
    // No retry instruction after the second rejection, and no fourth request.
    expect(model.requests).toHaveLength(3);

    expect(recap.checks).toMatchObject({ passed: true, issues: [] });
    expect(recap.headline).toBe("Groß tops Gameweek 4 with 17 points");
    expect(recap.paragraphs.join(" ")).not.toMatch(/19 points/);
    // The template made its own two calls after the model's nine, and cites only those.
    expect(recap.evidence.map((e) => e.tool).slice(-2)).toEqual(["gameweek_summary", "top_performers"]);
    expect(new Set(recap.claims.flatMap((c) => c.evidence))).toEqual(new Set(["r10", "r11"]));
    expect(() => recapSchema.parse(recap)).not.toThrow();
  });

  it("refuses tool calls past the limit and tells the model to submit", async () => {
    const model = scriptedModel("scripted", [
      investigate, // seven calls against a limit of three
      (request) => {
        const results = lastUserTurn(request).content;
        expect(results.map((b) => (b as { isError?: boolean }).isError ?? false)).toEqual([false, false, false, true, true, true, true]);
        expect((results[3] as { content: string }).content).toMatch(/used all 3 tool calls\. Call submit_recap now/);
        return { calls: [{ name: "season_records", input: {} }] }; // still refused
      },
      submit(badDraft()),
      submit(badDraft()),
    ]);
    const recap = await runRecapAgent({ context: context(), model, limits: { maxToolCallsPerAttempt: 3 } });

    // Only three investigating calls ran in the first attempt.
    expect(recap.evidence.slice(0, 3).map((e) => e.id)).toEqual(["r1", "r2", "r3"]);
    expect(recap.evidence[3].tool).toBe("submit_recap");
    expect(recap.run!.attempts[0]).toMatchObject({ outcome: "failed", toolCalls: 3 });
    expect(recap.run!.limits.maxToolCallsPerAttempt).toBe(3);
    expect(recap.run!.outcome).toBe("fallback");
    expect(recap.checks.passed).toBe(true);
  });

  it("gives up on a model that never submits, and uses the template", async () => {
    // It ignores every instruction and keeps calling the same tool.
    const model = scriptedModel("scripted", () => ({ calls: [{ name: "gameweek_summary", input: {} }] }));
    const recap = await runRecapAgent({ context: context(), model, limits: { maxToolCallsPerAttempt: 2 } });

    expect(recap.run).toMatchObject({
      outcome: "fallback",
      fallbackReason: "the model did not submit a recap within its turns",
      attempts: [{ attempt: 1, outcome: "aborted", toolCalls: 2 }],
    });
    expect(model.requests.length).toBeLessThanOrEqual(2 + 4);
    // Two calls by the model, two by the template.
    expect(recap.evidence).toHaveLength(4);
    expect(recap.checks.passed).toBe(true);
  });

  it("nudges a model that answers in prose instead of submitting", async () => {
    const model = scriptedModel("scripted", [investigate, { text: "Here is the recap: ..." }, submit(goodDraft())]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(recap.run!.outcome).toBe("first-try");
    expect(lastUserTurn(model.requests[2]).content).toEqual([
      { type: "text", text: "Finish by calling submit_recap with the recap. Do not write it as a message." },
    ]);
  });

  it("does not run tool calls from a reply cut off at the output limit", async () => {
    const model = scriptedModel("scripted", [
      { calls: [{ name: "submit_recap", input: { headline: "Cut" } }], stopReason: "max_tokens" },
      investigate,
      submit(goodDraft()),
    ]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(lastUserTurn(model.requests[1]).content[0]).toMatchObject({ isError: true, content: expect.stringMatching(/cut off/) });
    expect(recap.evidence).toHaveLength(8);
    expect(recap.run!.outcome).toBe("first-try");
  });

  it("stops at the overall timeout and uses the template", async () => {
    let signal: AbortSignal | undefined;
    const hanging: RecapModel = {
      id: "hanging",
      send: (request) => {
        signal = request.signal;
        return new Promise(() => {});
      },
    };
    const started = Date.now();
    const recap = await runRecapAgent({ context: context(), model: hanging, limits: { timeoutMs: 40 } });

    expect(Date.now() - started).toBeLessThan(2000);
    expect(signal?.aborted).toBe(true);
    expect(recap.run).toMatchObject({
      outcome: "fallback",
      fallback: true,
      fallbackReason: "timeout",
      attempts: [{ attempt: 1, outcome: "aborted", reason: "timeout", toolCalls: 0 }],
      modelCalls: 0,
    });
    expect(recap.checks.passed).toBe(true);
    expect(recap.timing.durationMs).toBeGreaterThanOrEqual(40);
  });

  it("applies the timeout to the whole run, not to each request", async () => {
    const slow = scriptedModel("slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { calls: [{ name: "gameweek_summary", input: {} }] };
    });
    const recap = await runRecapAgent({ context: context(), model: slow, limits: { timeoutMs: 100 } });
    expect(recap.run).toMatchObject({ outcome: "fallback", fallbackReason: "timeout" });
    expect(slow.requests.length).toBeLessThan(6);
  });

  it("answers invalid tool input with a clear error and carries on", async () => {
    const model = scriptedModel("scripted", [
      {
        calls: [
          { name: "top_performers", input: { limit: "plenty" } },
          { name: "league_table", input: {} },
          { name: "player_story", input: { player: "Zinedine Zidane" } },
          { name: "submit_recap", input: { headline: "No paragraphs or claims" } },
        ],
      },
      investigate,
      submit(JSON.parse(JSON.stringify(goodDraft()).replace(/"r(\d)"/g, (_, n) => `"r${Number(n) + 4}"`))),
    ]);
    const recap = await runRecapAgent({ context: context(), model });

    const errors = lastUserTurn(model.requests[1]).content as { content: string; isError?: boolean }[];
    expect(errors.every((b) => b.isError)).toBe(true);
    expect(errors[0].content).toMatch(/^Invalid input for top_performers: limit: /);
    expect(errors[0].content).toMatch(/returned no result, so it cannot be cited/);
    expect(errors[1].content).toMatch(/There is no tool called "league_table"\. The tools are: gameweek_summary, /);
    expect(errors[2].content).toMatch(/No player matches "Zinedine Zidane"/);
    expect(errors[3].content).toMatch(/^Invalid input for submit_recap: /);

    // Failed calls are logged but are not evidence; a malformed submission is not an attempt.
    expect(recap.evidence.slice(0, 4).map((e) => e.ok)).toEqual([false, false, false, false]);
    expect(recap.run).toMatchObject({ outcome: "first-try", attempts: [{ attempt: 1, outcome: "passed", toolCalls: 10 }] });
    expect(recap.checks.passed).toBe(true);
  });

  it("rejects a recap that cites a failed call", async () => {
    const draft = goodDraft();
    draft.claims[0].evidence = ["r1"];
    const model = scriptedModel("scripted", [
      { calls: [{ name: "top_performers", input: { limit: 0 } }] }, // r1 fails
      submit(draft),
      submit(draft),
    ]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(recap.evidence[0]).toMatchObject({ id: "r1", ok: false });
    expect(recap.run!.attempts[0].outcome).toBe("failed");
    expect(recap.run!.outcome).toBe("fallback");
  });

  it("logs every call in order and adds up tokens, cost and time", async () => {
    const model = scriptedModel("claude-haiku-5-5", [
      { ...investigate, usage: { inputTokens: 500, outputTokens: 300, cacheCreationInputTokens: 4000 } },
      { ...submit(badDraft()), usage: { inputTokens: 100, outputTokens: 900, cacheReadInputTokens: 4000, cacheCreationInputTokens: 9000 } },
      { ...submit(goodDraft()), usage: { inputTokens: 200, outputTokens: 800, cacheReadInputTokens: 13000, cacheCreationInputTokens: 1500 } },
    ]);
    const times = [new Date("2026-11-23T03:00:00.000Z"), new Date("2026-11-23T03:00:41.500Z")];
    const recap = await runRecapAgent({ context: context(), model, now: () => times.shift()! });

    // Seven tool calls and two submissions, numbered in call order, with inputs and results.
    expect(recap.evidence.map((e) => e.id)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"]);
    expect(recap.evidence.slice(0, 7)).toEqual(sample.evidence);
    expect(recap.evidence[7]).toMatchObject({ tool: "submit_recap", ok: true, input: badDraft(), result: { accepted: false } });
    expect(recap.evidence[8]).toMatchObject({ tool: "submit_recap", ok: true, input: goodDraft(), result: { accepted: true } });

    expect(recap.model).toBe("claude-haiku-5-5");
    expect(recap.usage).toEqual({
      inputTokens: 500 + 4000 + 100 + 4000 + 9000 + 200 + 13000 + 1500,
      outputTokens: 2000,
      toolCalls: 9,
      cacheReadInputTokens: 17000,
      cacheCreationInputTokens: 14500,
    });
    // Haiku 5.5: $0.10 in, $0.50 out, $0.125 cache write, $0.01 cache read, per million tokens.
    const expected = (800 * 0.1 + 2000 * 0.5 + 14500 * 0.125 + 17000 * 0.01) / 1_000_000;
    expect(recap.costUsd).toBeCloseTo(expected, 8);
    expect(recap.run).toMatchObject({ priced: true, modelCalls: 3 });
    expect(recap.timing).toEqual({ startedAt: "2026-11-23T03:00:00.000Z", durationMs: 41_500 });
    expect(recap.generatedAt).toBe("2026-11-23T03:00:41.500Z");
  });

  it("says when the model has no price, rather than reporting a cost of 0 as known", async () => {
    const model = scriptedModel("some-new-model", [{ ...investigate, usage: { inputTokens: 10 } }, submit(goodDraft())]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(recap).toMatchObject({ costUsd: 0, run: { priced: false } });
  });

  it("throws a model error instead of publishing a template", async () => {
    const broken: RecapModel = {
      id: "broken",
      send: async () => {
        throw new Error("401 authentication_error");
      },
    };
    await expect(runRecapAgent({ context: context(), model: broken })).rejects.toThrow("401 authentication_error");
  });

  it("treats a refusal as a reason for the template", async () => {
    const model = scriptedModel("scripted", [{ text: "I can't help with that.", stopReason: "refusal" }]);
    const recap = await runRecapAgent({ context: context(), model });
    expect(recap.run).toMatchObject({ outcome: "fallback", fallbackReason: "the model refused" });
  });
});

describe("pricing", () => {
  it("prices each candidate model, and a dated id like its undated one", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
    expect(costOfRequest("claude-sonnet-5-5", usage)).toBeCloseTo(12);
    expect(costOfRequest("claude-opus-5-5", usage)).toBeCloseTo(24);
    expect(pricesFor("claude-sonnet-5-5-20260901")).toBe(pricesFor("claude-sonnet-5-5"));
    expect(pricesFor("claude-sonnet-5-50")).toBeUndefined();
    expect(costOfRequest("gpt-oss", usage)).toBeNull();
  });

  it("charges Haiku's long-prompt price only to a request over the threshold", () => {
    const short = { inputTokens: 50_000, outputTokens: 1000, cacheReadInputTokens: 50_000, cacheCreationInputTokens: 0 };
    const long = { ...short, inputTokens: 50_001 };
    expect(costOfRequest("claude-haiku-5-5", short)).toBeCloseTo((50_000 * 0.1 + 1000 * 0.5 + 50_000 * 0.01) / 1e6, 9);
    expect(costOfRequest("claude-haiku-5-5", long)).toBeCloseTo((50_001 * 0.5 + 1000 * 2.5 + 50_000 * 0.05) / 1e6, 9);
  });
});

describe("the Claude API model", () => {
  it("maps a request to the Messages API and the reply back, without touching the network", async () => {
    const calls: { params: Anthropic.MessageCreateParamsNonStreaming; options: { signal?: AbortSignal } }[] = [];
    const client = {
      messages: {
        create: async (params: Anthropic.MessageCreateParamsNonStreaming, options: { signal?: AbortSignal }) => {
          calls.push({ params, options });
          return {
            content: [
              { type: "thinking", thinking: "..." },
              { type: "text", text: "Looking." },
              { type: "tool_use", id: "toolu_2", name: "top_performers", input: { limit: 3 } },
            ],
            stop_reason: "tool_use",
            usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 56, cache_creation_input_tokens: null },
          };
        },
      },
    } as unknown as Anthropic;

    const model = anthropicModel("claude-sonnet-5-5", client);
    const signal = new AbortController().signal;
    const response = await model.send({
      system: "Be factual.",
      tools: toolDefinitions().slice(0, 2),
      maxOutputTokens: 777,
      signal,
      messages: [
        { role: "user", content: [{ type: "text", text: "Go." }] },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "gameweek_summary", input: {} }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: "Result id: r1\n{}" }] },
      ],
    });

    expect(model.id).toBe("claude-sonnet-5-5");
    expect(calls[0].options.signal).toBe(signal);
    expect(calls[0].params).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 777,
      system: [{ type: "text", text: "Be factual.", cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "Go." }] },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "gameweek_summary", input: {} }] },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: "Result id: r1\n{}", is_error: false, cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    });
    expect(calls[0].params.tools).toMatchObject([{ name: "gameweek_summary" }, { name: "story_candidates" }]);
    expect(calls[0].params).not.toHaveProperty("tool_choice");
    expect(JSON.stringify(calls[0].params)).not.toMatch(/api[_-]?key/i);

    expect(response).toEqual({
      content: [
        { type: "text", text: "Looking." },
        { type: "tool_use", id: "toolu_2", name: "top_performers", input: { limit: 3 } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 12, outputTokens: 34, cacheReadInputTokens: 56, cacheCreationInputTokens: 0 },
    });
  });
});
