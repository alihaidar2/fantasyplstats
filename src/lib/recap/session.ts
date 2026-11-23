// A recap session: the tools bound to one gameweek's context, and the
// evidence log of everything they returned. The agent (a later step) calls
// tools through a session; the checker reads its log.

import { z } from "zod";
import { checkRecap } from "./checker";
import type { GameweekContext } from "./context";
import { recapDraftSchema, type CheckReport, type EvidenceEntry, type RecapDraft } from "./recap";
import { RECAP_TOOLS } from "./tools";
import { nameIndexOf } from "./tools/shared";
import { ToolInputError, type RecapTool } from "./tools/tool";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input, in the shape the Claude API's tool use expects. */
  input_schema: Record<string, unknown>;
}

/** The tools as name, description and JSON Schema, ready to hand to a model. */
export function toolDefinitions(tools: readonly RecapTool[] = RECAP_TOOLS): ToolDefinition[] {
  return tools.map((tool) => {
    const schema: Record<string, unknown> = { ...z.toJSONSchema(tool.input, { io: "input" }) };
    delete schema.$schema;
    return { name: tool.name, description: tool.description, input_schema: schema };
  });
}

export interface RecapSession {
  context: GameweekContext;
  /** Every call so far, in order. Append-only. */
  evidence: readonly EvidenceEntry[];
  /**
   * Runs a tool and logs the call. Never throws for a bad tool name or bad
   * input: the entry comes back with `ok: false` and a message for the agent.
   */
  call(tool: string, input: unknown): EvidenceEntry;
  /** Checks a draft against the evidence so far, without logging anything. */
  check(draft: RecapDraft): CheckReport;
  /** The last draft submit_recap accepted, with its report. */
  accepted: { draft: RecapDraft; checks: CheckReport } | null;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

export function createRecapSession(context: GameweekContext, tools: readonly RecapTool[] = RECAP_TOOLS): RecapSession {
  const evidence: EvidenceEntry[] = [];
  const byName = new Map(tools.map((t) => [t.name, t]));

  const check = (draft: RecapDraft) =>
    checkRecap(draft, {
      season: context.season,
      gameweek: context.gameweek,
      evidence,
      names: nameIndexOf(context),
      nameEntries: context.names,
    });

  const session: RecapSession = {
    context,
    evidence,
    accepted: null,
    check,
    call(name, input) {
      const id = `r${evidence.length + 1}`;
      const log = (ok: boolean, result: unknown): EvidenceEntry => {
        // Through JSON, so the log holds exactly what a saved recap will.
        const entry: EvidenceEntry = JSON.parse(JSON.stringify({ id, tool: name, input: input ?? {}, ok, result }));
        evidence.push(entry);
        return entry;
      };

      const tool = byName.get(name);
      if (!tool) {
        return log(false, { error: `There is no tool called "${name}". The tools are: ${[...byName.keys()].join(", ")}.` });
      }
      const parsed = tool.input.safeParse(input ?? {});
      if (!parsed.success) {
        return log(false, { error: `Invalid input for ${name}: ${describeIssues(parsed.error)}.` });
      }
      try {
        const result = tool.run(context, parsed.data, evidence);
        if (name === "submit_recap" && (result as { accepted?: boolean }).accepted) {
          const draft = recapDraftSchema.parse(parsed.data);
          session.accepted = { draft, checks: check(draft) };
        }
        return log(true, result);
      } catch (error) {
        if (error instanceof ToolInputError) return log(false, { error: error.message });
        throw error;
      }
    },
  };
  return session;
}
