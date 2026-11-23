// The model behind the recap agent and the eval judge, as a small interface:
// one request in, one reply out. The real implementation is in
// anthropic-model.ts (the Claude API); tests and offline runs use the
// scripted model below, so nothing here touches the network.

import type { ToolDefinition } from "./session";

export type ModelBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type UserBlock =
  | { type: "text"; text: string }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type ModelMessage =
  | { role: "user"; content: UserBlock[] }
  | { role: "assistant"; content: ModelBlock[] };

export interface ModelUsage {
  /** Input tokens billed at the full price (not read from or written to the prompt cache). */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface ModelRequest {
  system: string;
  messages: readonly ModelMessage[];
  tools: readonly ToolDefinition[];
  maxOutputTokens: number;
  /** Aborted when the run's overall timeout passes. */
  signal?: AbortSignal;
}

export interface ModelResponse {
  content: ModelBlock[];
  /** The API's stop_reason: "tool_use", "end_turn", "max_tokens", "refusal", ... */
  stopReason: string;
  usage: ModelUsage;
}

export interface RecapModel {
  /** The model id, e.g. "claude-haiku-5-5". Saved with the recap and used to price it. */
  id: string;
  send(request: ModelRequest): Promise<ModelResponse>;
}

export const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

export function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
  };
}

// ---- A scripted model, for tests and offline runs ---------------------------

/** One scripted reply: the tool calls to make (or plain text), with optional usage. */
export interface ScriptedReply {
  text?: string;
  calls?: { name: string; input: unknown }[];
  stopReason?: string;
  usage?: Partial<ModelUsage>;
}

/** A step is a reply, or a function of the request so far (to read result ids out of the conversation). */
export type ScriptedStep = ScriptedReply | ((request: ModelRequest, turn: number) => ScriptedReply | Promise<ScriptedReply>);

export interface ScriptedModel extends RecapModel {
  /** Every request received, in order. */
  requests: ModelRequest[];
}

/**
 * A model that replies from a script. `steps` is a list (one per request; the
 * last is repeated if the conversation runs longer) or a single function
 * called for every request.
 */
export function scriptedModel(id: string, steps: readonly ScriptedStep[] | Extract<ScriptedStep, (...args: never[]) => unknown>): ScriptedModel {
  const requests: ModelRequest[] = [];
  return {
    id,
    requests,
    async send(request) {
      const turn = requests.length;
      // A snapshot: the agent keeps appending to its message list.
      requests.push({ ...request, messages: structuredClone([...request.messages]) });
      const step = typeof steps === "function" ? steps : steps[Math.min(turn, steps.length - 1)];
      if (step === undefined) throw new Error("The scripted model has no steps.");
      const reply = typeof step === "function" ? await step(request, turn) : step;
      const content: ModelBlock[] = [];
      if (reply.text) content.push({ type: "text", text: reply.text });
      (reply.calls ?? []).forEach((call, i) => {
        content.push({ type: "tool_use", id: `toolu_${turn + 1}_${i + 1}`, name: call.name, input: call.input });
      });
      return {
        content,
        stopReason: reply.stopReason ?? (reply.calls?.length ? "tool_use" : "end_turn"),
        usage: { ...NO_USAGE, ...reply.usage },
      };
    },
  };
}

/** The text of every tool result in a conversation, in order: what a scripted step reads ids from. */
export function toolResultsOf(messages: readonly ModelMessage[]): string[] {
  return messages.flatMap((m) =>
    m.role === "user" ? m.content.flatMap((b) => (b.type === "tool_result" ? [b.content] : [])) : [],
  );
}
