// What a recap tool is: a named, typed function over one gameweek's context.
// The input is a zod schema (exported as JSON Schema for the agent) and the
// result is plain JSON that follows the conventions in shared.ts.

import type { z } from "zod";
import type { GameweekContext } from "../context";
import type { EvidenceEntry } from "../recap";

export interface RecapTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  /** Shown to the agent. Say what the tool is for and anything it cannot know. */
  description: string;
  input: Schema;
  /** `evidence` is the log of earlier calls; only submit_recap reads it. */
  run(context: GameweekContext, input: z.output<Schema>, evidence: readonly EvidenceEntry[]): unknown;
}

export function defineTool<Schema extends z.ZodType>(tool: RecapTool<Schema>): RecapTool<Schema> {
  return tool;
}

/** The agent asked for something that doesn't exist or is ambiguous. The message goes back to it. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}
