// Scripted stand-ins for the writer and the judge, for `npm run recap:eval --
// --fake` and the tests: the whole pipeline runs with no network and no key.
// They are plumbing checks, not writers: the "recap" is the fallback template
// submitted through the front door, and the "judgement" is word matching.

import { JUDGE_TOOL, RUBRIC_KEYS, type Judgement } from "./judge";
import { scriptedModel, toolResultsOf, type ModelRequest, type ScriptedModel } from "./model";
import type { EvidenceEntry } from "./recap";
import { TEMPLATE_CALLS, buildTemplateRecap } from "./template";

export const FAKE_WRITER_ID = "fake-writer";
export const FAKE_JUDGE_ID = "fake-judge";

/** Tokens a scripted reply pretends to have used, so usage accounting has something to add up. */
const FAKE_USAGE = { inputTokens: 1000, outputTokens: 200 } as const;

/** Rebuilds evidence entries from the tool results the agent sent back ("Result id: r1\n{...}"). */
export function evidenceFromConversation(request: Pick<ModelRequest, "messages">): EvidenceEntry[] {
  const tools = request.messages.flatMap((m) =>
    m.role === "assistant" ? m.content.flatMap((b) => (b.type === "tool_use" ? [b] : [])) : [],
  );
  return toolResultsOf(request.messages).flatMap((text, i) => {
    const match = /^Result id: (r\d+)\n([\s\S]+)$/.exec(text);
    if (!match || !tools[i]) return [];
    return [{ id: match[1], tool: tools[i].name, input: tools[i].input, ok: true, result: JSON.parse(match[2]) }];
  });
}

/** A writer that calls the template's two tools, then submits the template built from what came back. */
export function fakeWriterModel(id: string = FAKE_WRITER_ID): ScriptedModel {
  return scriptedModel(id, (request) => {
    // By the conversation, not a turn count: one model writes many gameweeks.
    if (request.messages.length === 1) {
      return { calls: TEMPLATE_CALLS.map((c) => ({ name: c.tool, input: c.input })), usage: FAKE_USAGE };
    }
    const draft = buildTemplateRecap(evidenceFromConversation(request));
    if (!draft) throw new Error("The fake writer was not given the results of its tool calls.");
    return { calls: [{ name: "submit_recap", input: draft }], usage: FAKE_USAGE };
  });
}

/**
 * A judge that marks a reference story covered when the recap contains one of
 * the capitalised words of its title (a player or a club), and scores every
 * rubric line 3.
 */
export function fakeJudgeModel(id: string = FAKE_JUDGE_ID): ScriptedModel {
  return scriptedModel(id, (request) => {
    const first = request.messages[0];
    const prompt = first.role === "user" && first.content[0].type === "text" ? first.content[0].text : "";
    const recap = /<recap>([\s\S]*)<\/recap>/.exec(prompt)?.[1] ?? "";
    const coverage: Judgement["coverage"] = [...prompt.matchAll(/^Story (\d+): (.+)$/gm)].map((match) => {
      const names = (match[2].match(/\p{Lu}[\p{L}'.-]{3,}/gu) ?? []).map((name) => name.replace(/['’]s$/, ""));
      const found = names.find((name) => recap.includes(name));
      return {
        story: Number(match[1]),
        covered: found ? "yes" : "no",
        reason: found ? `The recap mentions ${found}.` : "The recap mentions none of the names in this story's title.",
      };
    });
    const rubric = Object.fromEntries(
      RUBRIC_KEYS.map((key) => [key, { score: 3, reason: "Scripted judge: not a real assessment." }]),
    ) as Judgement["rubric"];
    return { calls: [{ name: JUDGE_TOOL, input: { coverage, rubric } }], usage: FAKE_USAGE };
  });
}
