// The eval judge: a second, stronger model reads a gameweek's reference
// stories and a recap, and says which stories the recap covers and how good
// the writing is, as structured JSON. The checker decides whether a recap is
// true; the judge only says whether it is any good.

import { z } from "zod";
import { NO_USAGE, addUsage, type ModelMessage, type ModelUsage, type RecapModel } from "./model";
import { MODEL_PRICES_USD_PER_MTOK, costOfRequest, roundUsd, type ModelPrices } from "./pricing";
import type { ToolDefinition } from "./session";

// ---- Reference stories ---------------------------------------------------------

export interface ReferenceStory {
  /** 1, 2, ... in file order: what the judge refers to. */
  number: number;
  title: string;
  /** Everything under the heading, as written. */
  body: string;
}

export interface ReferenceStories {
  /** The file's main heading, if it has one. */
  title: string | null;
  /** True while the file still carries its "DRAFT: needs human review" line. */
  draft: boolean;
  stories: ReferenceStory[];
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
/**
 * "1. Title", "1) Title", "Story 1: Title", "3 - Title", "**1.** Title". The
 * mark after the number must be followed by a space, so a title that merely
 * starts with a figure ("1.79 million Triple Captains") is not a numbered one.
 */
const NUMBERED = /^(?:\*\*|__)?\s*(?:story\s+)?(\d+)\s*(?:[.):]|\s[-–—])(?:\*\*|__)?\s+(.+)$/i;
const strip = (text: string) => text.replace(/\*\*|__|`/g, "").trim();

/**
 * Reads the stories out of a reference file (evals/references/<season>/gwNN.md).
 * The files are hand-edited markdown, so this is lenient: a story is a
 * numbered heading at any level ("## 1. Title", "### Story 2: Title"). In a
 * file with no numbered headings, every heading below the main one is a story.
 */
export function parseReferenceStories(markdown: string): ReferenceStories {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings: { line: number; level: number; text: string; numbered: RegExpExecArray | null }[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    const match = HEADING.exec(line);
    if (match) headings.push({ line: i, level: match[1].length, text: match[2], numbered: NUMBERED.exec(match[2]) });
  });

  const top = headings.length ? Math.min(...headings.map((h) => h.level)) : 0;
  const main = headings.find((h) => h.level === top && !h.numbered && headings.filter((x) => x.level === top).length === 1);
  const anyNumbered = headings.some((h) => h.numbered);
  const storyHeadings = headings.filter((h) => (anyNumbered ? h.numbered !== null : h !== main));

  const stories = storyHeadings.map((heading, i) => {
    // A story runs to the next story, or to a heading at its own level or above.
    const next = headings.find((h) => h.line > heading.line && (storyHeadings.includes(h) || h.level <= heading.level));
    const body = lines.slice(heading.line + 1, next ? next.line : lines.length).join("\n").trim();
    return { number: i + 1, title: strip(heading.numbered ? heading.numbered[2] : heading.text), body };
  });

  return {
    title: main ? strip(main.text) : null,
    draft: /^\W*DRAFT\b/im.test(markdown),
    stories: stories.filter((s) => s.title.length > 0),
  };
}

// ---- The judgement ---------------------------------------------------------------

export const RUBRIC = {
  insight:
    "Insight. Does the recap tell an FPL manager why things mattered (ownership, captaincy, price, differentials, " +
    "streaks, season context), or does it only list scores? 1: a list of results and points with no angle. " +
    "3: some context on the main story, the rest is listing. 5: every story is framed by what it meant for managers, " +
    "with the telling figure chosen each time.",
  storySelection:
    "Picking the right stories. Did it lead with the biggest story of the gameweek and give its space to what " +
    "mattered most, judged against the reference stories? 1: the main stories are missing or buried under minor ones. " +
    "3: the main story is there but the order or the rest is off. 5: the biggest stories, in a sensible order, " +
    "with nothing trivial taking their place.",
  /** For paragraph recaps (saved recap version 1). Kept as it was, so old scores stay what they were. */
  readability:
    "Readability. Is it clear, lively UK English that reads well from start to finish? 1: clumsy, repetitive or " +
    "robotic; hard to follow. 3: clear but flat, or with awkward sentences (stats crammed in, stilted phrasing). " +
    "5: a pleasure to read: varied sentences, a good headline, no padding.",
} as const;

/**
 * Readability depends on the format. A card recap is terse on purpose (a
 * headline and a few cards of figures with a line each, read on a phone), so
 * asking whether it "reads well from start to finish" as prose measures the
 * format, not the writing. Card recaps get their own criterion, with anchors;
 * insight and story selection are the same for both. A score under one
 * version is not comparable with a score under another.
 */
export type RecapFormat = "paragraphs" | "cards";
export type ReadabilityRubricVersion = "paragraphs-v1" | "cards-v1";

export const READABILITY_RUBRIC_OF: Record<RecapFormat, ReadabilityRubricVersion> = {
  paragraphs: "paragraphs-v1",
  cards: "cards-v1",
};

export const READABILITY_RUBRICS: Record<ReadabilityRubricVersion, string> = {
  "paragraphs-v1": RUBRIC.readability,
  "cards-v1":
    "Readability (of story cards). Can a manager take in the gameweek in half a minute on a phone? Judge these six things: " +
    "the headline lands (specific to this gameweek, says the main story); each card makes one clear point, and its title says what that point is; " +
    "every number is labelled and means something to a manager (a figure with no label, or one the reader must work out, is a fault); " +
    "there is no stat dump (a card or line that piles up figures without saying what they add up to) and no repetition of the same figure across cards; " +
    "no jargon or abbreviations a casual FPL manager would not know; and the short text is plain, correct UK English. " +
    "Short is not a fault: do not mark a card down for lacking flowing prose, linking sentences or length. Do mark it down for clutter, vagueness and clumsy wording. " +
    "1: a jumble: cards with no clear point, unlabelled or unexplained figures, text that is hard to parse. " +
    "2: you can find the stories but have to work for them: a vague or generic headline (\"Gameweek 7 recap\", or one that only names a score), " +
    "several cards that mix two or three points or list figures with no point, titles that are bare labels (\"Players\", \"Notes\"), a line that repeats its card's figures or reads as a stat list. " +
    "3: competent: every card can be read at a glance and the numbers are labelled, but it is flat or uneven: one or two cards are cluttered or make no clear point, " +
    "a line restates what the card already shows, a title is generic, or a sentence is stilted. " +
    "4: clean throughout with at most one small blemish. " +
    "5: rare. Nothing to fix: a headline that could belong to no other gameweek, every card one point with a title that says it, every figure labelled and telling, " +
    "each line adds the so-what in a few plain words, nothing repeated, no jargon.",
};

export type RubricKey = keyof typeof RUBRIC;
export const RUBRIC_KEYS = Object.keys(RUBRIC) as RubricKey[];

const scoreSchema = z.object({
  score: z.number().int().min(1).max(5).describe("1 (poor) to 5 (excellent), by the rubric."),
  reason: z.string().min(1).describe("One or two short sentences."),
});

export const judgementSchema = z.object({
  coverage: z
    .array(
      z.object({
        story: z.number().int().min(1).describe("The reference story's number."),
        covered: z
          .enum(["yes", "partly", "no"])
          .describe('"yes": the recap tells this story. "partly": it mentions it in passing or misses its point. "no": absent.'),
        reason: z.string().min(1).describe("One short sentence: what the recap says about it, or that it says nothing."),
      }),
    )
    .describe("One entry for every reference story, in order."),
  rubric: z.object({ insight: scoreSchema, storySelection: scoreSchema, readability: scoreSchema }),
});

export type Judgement = z.infer<typeof judgementSchema>;

export const JUDGE_TOOL = "submit_judgement";

export function judgeToolDefinition(): ToolDefinition {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(judgementSchema, { io: "input" }) };
  delete schema.$schema;
  return {
    name: JUDGE_TOOL,
    description: "Submit the judgement of the recap: coverage of every reference story, and the three rubric scores.",
    input_schema: schema,
  };
}

const CARDS_NOTE =
  "\n\nThis recap is a set of story cards, shown one under another on a phone: a headline, then four to seven cards. " +
  "You see each card as its fields: its type, its title, the figures it displays (each with its label), and its short line of text, if it has one. " +
  "On the page the figures are drawn as big numbers, tiles, bars and scorelines, so the cards carry most of the story and the text is short by design.";

/** The judge's instructions for a recap of that format. Only the readability criterion (and, for cards, a note on what a card is) differs. */
export function judgeSystemPrompt(format: RecapFormat = "paragraphs"): string {
  return `You are judging a short Fantasy Premier League (FPL) gameweek recap written for fantasyplstats.com. You are given the reference stories for that gameweek (the three to five biggest stories, chosen by an editor from the data) and the recap. The recap's facts have already been verified by a separate checker, so do not judge accuracy. The recap could only use what FPL's data shows: do not mark it down for lacking team news, quotes, tactics or predictions.${format === "cards" ? CARDS_NOTE : ""}

Do two things.

1. Coverage. For each reference story, decide whether the recap covers it:
- "yes": a reader of the recap would come away knowing this story (its main subject and its point), even if it uses different figures or fewer details than the reference.
- "partly": the subject is mentioned but the point of the story is missing, or it is one clause in passing.
- "no": the recap does not mention it.
Give one entry for every reference story, in order, using the story's number.

2. Quality. Score the recap from 1 to 5 on each of these, with a short reason. Be a demanding editor: 3 is competent, 5 is rare.
- ${RUBRIC.insight}
- ${RUBRIC.storySelection}
- ${READABILITY_RUBRICS[READABILITY_RUBRIC_OF[format]]}

Reply only by calling ${JUDGE_TOOL}.`;
}

/** The paragraph-recap instructions, as they have always been. */
export const JUDGE_SYSTEM_PROMPT = judgeSystemPrompt("paragraphs");

/**
 * What the judge is shown. A paragraph recap is its paragraphs. A card recap
 * is one block per card, each already laid out field by field (cardToJudgeView
 * in text.ts), so the judge sees cards rather than prose made out of them.
 */
export type RecapText =
  | { headline: string; paragraphs: readonly string[]; cards?: undefined }
  | { headline: string; cards: readonly string[]; paragraphs?: undefined };

export const formatOfRecapText = (recap: RecapText): RecapFormat => (recap.cards ? "cards" : "paragraphs");

/** The judge's one user message. Stories are labelled "Story N: title" so replies can use the number. */
export function judgeUserMessage(gameweek: number, references: ReferenceStories, recap: RecapText): string {
  const stories = references.stories.map((s) => `Story ${s.number}: ${s.title}\n${s.body}`.trim()).join("\n\n");
  const body = recap.cards ? recap.cards.join("\n\n") : recap.paragraphs.join("\n\n");
  return (
    `<reference_stories gameweek="${gameweek}">\n${stories}\n</reference_stories>\n\n` +
    `<recap${recap.cards ? ' format="cards"' : ""}>\n<headline>${recap.headline}</headline>\n${body}\n</recap>\n\n` +
    `Judge the recap against the ${references.stories.length} reference stories and the rubric.`
  );
}

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeError";
  }
}

export interface JudgeOptions {
  model: RecapModel;
  gameweek: number;
  references: ReferenceStories;
  recap: RecapText;
  maxOutputTokens?: number;
  prices?: Readonly<Record<string, ModelPrices>>;
  signal?: AbortSignal;
}

export interface JudgeResult {
  judgement: Judgement;
  /** Which readability criterion the judge was given: scores under different versions are not comparable. */
  readabilityRubric: ReadabilityRubricVersion;
  /** Covered stories as a share of the reference stories: "yes" counts 1, "partly" a half. */
  coverageScore: number;
  model: string;
  usage: ModelUsage;
  costUsd: number;
  priced: boolean;
}

/** Reads a judgement out of a reply: the tool call, or failing that a JSON object in its text. */
function readJudgement(content: ModelMessage["content"], storyCount: number): { judgement?: Judgement; problem?: string } {
  let raw: unknown;
  for (const block of content) {
    if (block.type === "tool_use" && block.name === JUDGE_TOOL) raw = block.input;
  }
  if (raw === undefined) {
    const text = content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return { problem: `Reply by calling ${JUDGE_TOOL}.` };
    try {
      raw = JSON.parse(text.slice(start, end + 1));
    } catch {
      return { problem: `The reply was not valid JSON. Reply by calling ${JUDGE_TOOL}.` };
    }
  }
  const parsed = judgementSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { problem: `The judgement was not in the expected shape: ${issues}.` };
  }
  const numbers = parsed.data.coverage.map((c) => c.story).sort((a, b) => a - b);
  const expected = Array.from({ length: storyCount }, (_, i) => i + 1);
  if (numbers.join(",") !== expected.join(",")) {
    return { problem: `Give exactly one coverage entry for each of the ${storyCount} reference stories (${expected.join(", ")}).` };
  }
  parsed.data.coverage.sort((a, b) => a.story - b.story);
  return { judgement: parsed.data };
}

/** Asks the judge model for a judgement. One re-ask if the reply can't be read; then a JudgeError. */
export async function judgeRecap(options: JudgeOptions): Promise<JudgeResult> {
  const { model, references } = options;
  if (references.stories.length === 0) throw new JudgeError("There are no reference stories to judge against.");
  const prices = options.prices ?? MODEL_PRICES_USD_PER_MTOK;
  const format = formatOfRecapText(options.recap);
  const messages: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: judgeUserMessage(options.gameweek, references, options.recap) }] },
  ];
  let usage = NO_USAGE;
  let cost = 0;
  let priced = true;
  let problem = "";

  for (let ask = 0; ask < 2; ask++) {
    const response = await model.send({
      system: judgeSystemPrompt(format),
      messages,
      tools: [judgeToolDefinition()],
      maxOutputTokens: options.maxOutputTokens ?? 2000,
      signal: options.signal,
    });
    usage = addUsage(usage, response.usage);
    const requestCost = costOfRequest(model.id, response.usage, prices);
    if (requestCost === null) priced = false;
    else cost += requestCost;

    const read = readJudgement(response.content, references.stories.length);
    if (read.judgement) {
      const { coverage } = read.judgement;
      const covered = coverage.reduce((sum, c) => sum + (c.covered === "yes" ? 1 : c.covered === "partly" ? 0.5 : 0), 0);
      return {
        judgement: read.judgement,
        readabilityRubric: READABILITY_RUBRIC_OF[format],
        coverageScore: covered / coverage.length,
        model: model.id,
        usage,
        costUsd: roundUsd(cost),
        priced,
      };
    }
    problem = read.problem ?? "unreadable";
    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((b) => b.type === "tool_use");
    messages.push({
      role: "user",
      content: calls.length
        ? calls.map((c) => ({ type: "tool_result" as const, toolUseId: c.id, content: problem, isError: true }))
        : [{ type: "text", text: problem }],
    });
  }
  throw new JudgeError(`The judge (${model.id}) did not return a usable judgement: ${problem}`);
}
