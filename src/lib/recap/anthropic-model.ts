// The real model: the Claude API through the official SDK. Kept out of
// index.ts so that importing the recap tools or the saved-recap schema (the
// site does) never pulls the SDK in.
//
// Credentials are whatever `new Anthropic()` resolves: ANTHROPIC_API_KEY, or
// ANTHROPIC_AUTH_TOKEN, or the profile `ant auth login` writes, or Workload
// Identity Federation from the environment (ANTHROPIC_FEDERATION_RULE_ID,
// ANTHROPIC_ORGANIZATION_ID and ANTHROPIC_IDENTITY_TOKEN_FILE or
// ANTHROPIC_IDENTITY_TOKEN). Nothing here names a key.

import Anthropic from "@anthropic-ai/sdk";
import type { ModelBlock, ModelMessage, ModelRequest, ModelResponse, RecapModel } from "./model";

const CACHE = { type: "ephemeral" } as const;

function toApiMessages(messages: readonly ModelMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = messages.map((message) =>
    message.role === "assistant"
      ? {
          role: "assistant",
          content: message.content.map((b) =>
            b.type === "text"
              ? { type: "text", text: b.text }
              : { type: "tool_use", id: b.id, name: b.name, input: b.input },
          ),
        }
      : {
          role: "user",
          content: message.content.map((b) =>
            b.type === "text"
              ? { type: "text", text: b.text }
              : { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError ?? false },
          ),
        },
  );
  // Cache the conversation so far: each turn of the loop resends all of it.
  const last = out.at(-1);
  if (last && Array.isArray(last.content)) {
    const block = last.content.at(-1);
    if (block && (block.type === "text" || block.type === "tool_result")) block.cache_control = CACHE;
  }
  return out;
}

/** A model that calls the Claude API. Pass a client to control retries or credentials; the default resolves them itself. */
export function anthropicModel(id: string, client: Anthropic = new Anthropic()): RecapModel {
  return {
    id,
    async send(request: ModelRequest): Promise<ModelResponse> {
      const message = await client.messages.create(
        {
          model: id,
          max_tokens: request.maxOutputTokens,
          // The system prompt and tools are the same on every turn: cache them.
          system: [{ type: "text", text: request.system, cache_control: CACHE }],
          tools: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          })),
          messages: toApiMessages(request.messages),
        },
        { signal: request.signal },
      );
      const content: ModelBlock[] = [];
      for (const block of message.content) {
        if (block.type === "text") content.push({ type: "text", text: block.text });
        else if (block.type === "tool_use") content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
      }
      return {
        content,
        stopReason: message.stop_reason ?? "unknown",
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
