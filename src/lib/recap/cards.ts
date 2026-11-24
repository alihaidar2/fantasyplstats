// The recap as story cards (saved recap version 2): a headline, then 4 to 7
// typed cards the writer picks for the gameweek (a strip of key numbers, the
// captaincy, a list of players, the matches that mattered, the transfer
// market, short notes). Every figure and name is a field of its own, and
// every card cites the tool results it was built from, so the checker
// (checker.ts) can verify each one, and each player's figures against that
// player. Free text is short: a title, a label, one or two sentences.
//
// `cardStatements` turns a card into the plain sentences the checker reads
// ("Alysson scored 16 points.", "Alysson was owned by 0.1%."), one per
// figure, each naming only the player the figure belongs to.

import { z } from "zod";

/** Limits on cards. The checker enforces them and reports each breach in words. */
export const CARD_LIMITS = {
  minCards: 4,
  maxCards: 7,
  /** The one or two sentences a card may carry. */
  textMaxWords: 25,
  titleMaxWords: 6,
  labelMaxWords: 4,
  badgeMaxWords: 6,
  /** A player's stat line ("1 goal, 2 assists") or a transfer's extra line. */
  detailMaxWords: 10,
  noteMaxWords: 14,
  numbersMin: 2,
  numbersMax: 4,
  tilesMax: 3,
  playersMin: 1,
  playersMax: 4,
  matchesMin: 1,
  matchesMax: 3,
  movesMin: 1,
  movesMax: 3,
  notesMin: 2,
  notesMax: 4,
  maxEvidencePerCard: 6,
  runMinGameweeks: 2,
  runMaxGameweeks: 38,
} as const;

export type CardLimits = { [Limit in keyof typeof CARD_LIMITS]: number };

const evidence = z
  .array(z.string().regex(/^r\d+$/, 'expected a result id such as "r3"'))
  .min(1)
  .describe('The ids of the tool results every figure and name on this card comes from, e.g. ["r2", "r5"].');

const playerName = z.string().min(1).describe('The player\'s name exactly as the tools give it, e.g. "B.Fernandes".');
const playerRef = z
  .string()
  .regex(/^p\d+$/, 'expected a player ref such as "p411"')
  .describe('The player\'s ref from the tool results, e.g. "p411".');
const points = z.number().int().describe("The player's points this gameweek, as a tool returned them.");
const ownership = z
  .number()
  .min(0)
  .max(100)
  .describe('The player\'s ownership as a tool returned it, without the % sign: 79.5 for "79.5%".');
const figure = z
  .string()
  .min(1)
  .describe('One figure, written as a tool returned it: "55", "845,368", "79.5%", "£6.3m", "3-1".');
const label = z
  .string()
  .min(1)
  .describe('What the figure is, in a few lower-case words after it: "average score", "goals", "as captain".');
const text = z
  .string()
  .min(1)
  .describe("One or two short sentences of plain text (25 words at most) adding the point of the card.");
const title = z.string().min(1).describe("A short title in sentence case, at most 6 words.");

export const numbersCardSchema = z
  .object({
    type: z.literal("numbers"),
    items: z.array(z.object({ value: figure, label })).describe("2 to 4 key figures of the gameweek, each with a label."),
    evidence,
  })
  .describe("A strip of 2 to 4 key figures (the average score, the top score, goals, matches).");

export const captaincyCardSchema = z
  .object({
    type: z.literal("captaincy"),
    title: title.optional().describe('Default "The captaincy".'),
    player: playerName.describe("The most-captained player."),
    ref: playerRef,
    points,
    ownership: ownership.optional(),
    tiles: z
      .array(
        z.object({
          value: figure,
          label,
          player: playerName.optional().describe("Only when the figure is another player's (a better captain pick)."),
          ref: playerRef.optional(),
        }),
      )
      .optional()
      .describe("Up to 3 figures: what captains and Triple Captains earned, or the best alternative's captain score."),
    badge: z.string().min(1).optional().describe('A run or record in a few words, e.g. "2nd blank in a row".'),
    text: text.optional(),
    evidence,
  })
  .describe("The most-captained player: their score, big, with up to 3 figures beside it.");

export const playersCardSchema = z
  .object({
    type: z.literal("players"),
    title: title.describe('What the players have in common, e.g. "Hardly anyone had them".'),
    players: z
      .array(
        z.object({
          player: playerName,
          ref: playerRef,
          points,
          detail: z.string().min(1).optional().describe('A short stat line, e.g. "1 goal, 2 assists".'),
          ownership: ownership.optional().describe("Give it for every player or none: it is drawn as a bar."),
        }),
      )
      .describe("1 to 4 players, biggest story first."),
    text: text.optional(),
    evidence,
  })
  .describe("A titled list of 1 to 4 players: hauls, differentials, blanks of popular picks.");

export const matchesCardSchema = z
  .object({
    type: z.literal("matches"),
    title: title.optional().describe('Default "Matches that mattered".'),
    matches: z
      .array(
        z.object({
          home: z.string().min(1).describe("The home club, as the tools name it."),
          away: z.string().min(1).describe("The away club, as the tools name it."),
          score: z.string().regex(/^\d{1,2}-\d{1,2}$/, 'expected a score such as "3-1"').describe('Home goals first: "3-1".'),
        }),
      )
      .describe("1 to 3 results."),
    text: text.optional(),
    evidence,
  })
  .describe("1 to 3 results, with one line on who hauled in them.");

export const RUN_KINDS = ["scoring", "returns", "blanks", "no-minutes"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const transfersCardSchema = z
  .object({
    type: z.literal("transfers"),
    title: title.optional().describe('Default "The transfer market".'),
    moves: z
      .array(
        z.object({
          player: playerName,
          ref: playerRef,
          direction: z.enum(["in", "out"]),
          netTransfers: z.number().int().positive().describe("Net transfers in or out, as a tool returned them."),
          points: points.optional(),
          minutes: z.number().int().nonnegative().optional().describe("Minutes played this gameweek."),
          run: z
            .object({
              kind: z
                .enum(RUN_KINDS)
                .describe("scoring: a goal each week. returns: a goal or assist. blanks: 2 points or fewer. no-minutes: didn't play."),
              gameweeks: z.number().int().describe("How many gameweeks in a row, this one included, from player_story."),
            })
            .optional(),
          detail: z.string().min(1).optional().describe('A few words more, e.g. "still 34.5% owned".'),
        }),
      )
      .describe("1 to 3 players: the most bought and the most sold."),
    text: text.optional(),
    evidence,
  })
  .describe("The players managers bought and sold, and how that turned out.");

export const notesCardSchema = z
  .object({
    type: z.literal("notes"),
    title: title.optional().describe('Default "Also worth knowing".'),
    items: z
      .array(
        z.object({
          player: playerName.optional(),
          ref: playerRef.optional(),
          text: z
            .string()
            .min(1)
            .describe("One short line. With a player, it follows their name: \"scored in 3 gameweeks in a row\"."),
          points: points.optional().describe("Only with a player."),
        }),
      )
      .describe("2 to 4 one-line items."),
    evidence,
  })
  .describe("2 to 4 one-line notes that did not need a card of their own.");

export const recapCardSchema = z.discriminatedUnion("type", [
  numbersCardSchema,
  captaincyCardSchema,
  playersCardSchema,
  matchesCardSchema,
  transfersCardSchema,
  notesCardSchema,
]);

export type RecapCard = z.infer<typeof recapCardSchema>;
export type NumbersCard = z.infer<typeof numbersCardSchema>;
export type CaptaincyCard = z.infer<typeof captaincyCardSchema>;
export type PlayersCard = z.infer<typeof playersCardSchema>;
export type MatchesCard = z.infer<typeof matchesCardSchema>;
export type TransfersCard = z.infer<typeof transfersCardSchema>;
export type NotesCard = z.infer<typeof notesCardSchema>;
export type CardType = RecapCard["type"];

/** The title a card shows when the writer gave none. */
export const DEFAULT_CARD_TITLES: Record<CardType, string> = {
  numbers: "In numbers",
  captaincy: "The captaincy",
  players: "Players",
  matches: "Matches that mattered",
  transfers: "The transfer market",
  notes: "Also worth knowing",
};

export function cardTitle(card: { type: CardType; title?: string }): string {
  return card.title?.trim() || DEFAULT_CARD_TITLES[card.type];
}

// ---- Formatting ---------------------------------------------------------------

const COUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** 1318707 -> "1,318,707"; -2 -> "-2". */
export const formatCount = (n: number) => COUNT.format(n);

/** 79.5 -> "79.5%", 9 -> "9.0%": one decimal, as the tools write ownership. */
export const formatPercent = (n: number) => `${n.toFixed(1)}%`;

export const formatPoints = (n: number) => `${formatCount(n)} ${Math.abs(n) === 1 ? "pt" : "pts"}`;

/**
 * Adds thousands separators to the long whole numbers in free text:
 * "1318707 net transfers" -> "1,318,707 net transfers". Leaves decimals,
 * prices, scores, years ("2026") and seasons ("2026/27") alone.
 */
export function formatNumbersInText(text: string): string {
  return text.replace(/(?<![\d.,£/–-])\d{4,}(?![\d.,/–-]\d|\d)/g, (digits) => {
    const n = Number(digits);
    if (digits.length === 4 && n >= 1900 && n <= 2100) return digits;
    return formatCount(n);
  });
}

/** "scored in 5 gameweeks in a row", for a run of `kind`. */
export function runPhrase(kind: RunKind, gameweeks: number): string {
  switch (kind) {
    case "scoring":
      return `scored in ${gameweeks} gameweeks in a row`;
    case "returns":
      return `had a goal or assist in ${gameweeks} gameweeks in a row`;
    case "blanks":
      return `blanked in ${gameweeks} gameweeks in a row`;
    case "no-minutes":
      return `did not play in ${gameweeks} gameweeks in a row`;
  }
}

/** "scored in 5 gameweeks running": the shorter caption beside the run's blocks. */
export function runCaption(kind: RunKind, gameweeks: number): string {
  switch (kind) {
    case "scoring":
      return `scored in ${gameweeks} gameweeks running`;
    case "returns":
      return `a goal or assist in ${gameweeks} gameweeks running`;
    case "blanks":
      return `${gameweeks} blanks in a row`;
    case "no-minutes":
      return `${gameweeks} gameweeks without playing`;
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ---- What the checker reads ----------------------------------------------------

/** One piece of a card for the checker: a sentence, and where it came from for its messages. */
export interface CardStatement {
  /** "card 2, player 1", "card 3, text". */
  where: string;
  text: string;
  /**
   * Free text as written (a title, a label, a sentence) rather than a
   * sentence built from fields. Its names are checked as they stand.
   */
  written: boolean;
}

/** A player named on a card with the ref the writer gave, for checking that the two agree. */
export interface CardPlayerRef {
  where: string;
  player: string;
  ref: string | undefined;
}

/**
 * The card as sentences the checker can read. Each figure gets a sentence
 * that names the player (or club) it belongs to, with the stat word that
 * says what it counts, so the checker ties it to that player and stat.
 */
export function cardStatements(
  card: RecapCard,
  where: string,
  /** True when the text opens with a player or club name, whose capital must stay. */
  startsWithName: (text: string) => boolean = () => false,
): CardStatement[] {
  const out: CardStatement[] = [];
  /** Text read on after a name or a figure: "Haaland: scored in 3 gameweeks in a row." */
  const onward = (s: string) => (startsWithName(s) ? s : lowerFirst(s));
  const built = (at: string, text: string) => out.push({ where: `${where}, ${at}`, text, written: false });
  const written = (at: string, text: string | undefined) => {
    if (text?.trim()) out.push({ where: `${where}, ${at}`, text: text.trim(), written: true });
  };
  /** A label read after its figure: "55 average score". */
  const figureWithLabel = (who: string | null, value: string, labelText: string) =>
    `${who ? `${who}: ` : ""}${value} ${onward(labelText.trim())}.`;

  if ("title" in card) written("title", card.title);

  switch (card.type) {
    case "numbers":
      card.items.forEach((item, i) => {
        built(`figure ${i + 1}`, figureWithLabel(null, item.value, item.label));
      });
      break;
    case "captaincy":
      built("player", `${card.player} scored ${formatCount(card.points)} points.`);
      if (card.ownership !== undefined) built("ownership", `${card.player} was owned by ${formatPercent(card.ownership)}.`);
      card.tiles?.forEach((tile, i) => {
        built(`tile ${i + 1}`, figureWithLabel(tile.player ?? card.player, tile.value, tile.label));
      });
      if (card.badge?.trim()) {
        built("badge", `${card.player}: ${onward(card.badge.trim())}.`);
      }
      break;
    case "players":
      card.players.forEach((p, i) => {
        built(`player ${i + 1}`, `${p.player} scored ${formatCount(p.points)} points.`);
        if (p.ownership !== undefined) built(`player ${i + 1} ownership`, `${p.player} was owned by ${formatPercent(p.ownership)}.`);
        if (p.detail?.trim()) {
          built(`player ${i + 1} detail`, `${p.player}: ${onward(p.detail.trim())}.`);
        }
      });
      break;
    case "matches":
      card.matches.forEach((m, i) => built(`match ${i + 1}`, `${m.home} ${m.score} ${m.away}.`));
      break;
    case "transfers":
      card.moves.forEach((m, i) => {
        const at = `move ${i + 1}`;
        built(at, `${m.player}: ${formatCount(m.netTransfers)} net transfers ${m.direction}.`);
        if (m.points !== undefined) built(`${at} points`, `${m.player} scored ${formatCount(m.points)} points.`);
        if (m.minutes !== undefined) built(`${at} minutes`, `${m.player} played ${formatCount(m.minutes)} minutes.`);
        if (m.run) built(`${at} run`, `${m.player} ${runPhrase(m.run.kind, m.run.gameweeks)}.`);
        if (m.detail?.trim()) {
          built(`${at} detail`, `${m.player}: ${onward(m.detail.trim())}.`);
        }
      });
      break;
    case "notes":
      card.items.forEach((item, i) => {
        const at = `note ${i + 1}`;
        const line = item.text.trim();
        if (item.player) {
          // "N.Jackson scored in 3 gameweeks in a row": the line reads on from the name.
          const named = line.toLowerCase().startsWith(item.player.toLowerCase());
          built(at, named ? line : `${item.player} ${onward(line)}`);
          if (item.points !== undefined) built(`${at} points`, `${item.player} scored ${formatCount(item.points)} points.`);
        } else {
          written(at, line);
        }
      });
      break;
  }
  if ("text" in card) written("text", card.text);
  return out;
}

/** Every player a card names with a ref, so the checker can confirm each ref is that player. */
export function cardPlayerRefs(card: RecapCard, where: string): CardPlayerRef[] {
  switch (card.type) {
    case "numbers":
    case "matches":
      return [];
    case "captaincy":
      return [
        { where: `${where}, player`, player: card.player, ref: card.ref },
        ...(card.tiles ?? []).flatMap((t, i) => (t.player ? [{ where: `${where}, tile ${i + 1}`, player: t.player, ref: t.ref }] : [])),
      ];
    case "players":
      return card.players.map((p, i) => ({ where: `${where}, player ${i + 1}`, player: p.player, ref: p.ref }));
    case "transfers":
      return card.moves.map((m, i) => ({ where: `${where}, move ${i + 1}`, player: m.player, ref: m.ref }));
    case "notes":
      return card.items.flatMap((n, i) => (n.player ? [{ where: `${where}, note ${i + 1}`, player: n.player, ref: n.ref }] : []));
  }
}

/** The free text on a card with the most words each piece may have, for the length checks. */
export function cardFreeText(card: RecapCard, limits: CardLimits = CARD_LIMITS): { at: string; text: string; maxWords: number }[] {
  const out: { at: string; text: string; maxWords: number }[] = [];
  const add = (at: string, text: string | undefined, maxWords: number) => {
    if (text !== undefined) out.push({ at, text, maxWords });
  };
  if ("title" in card) add("title", card.title, limits.titleMaxWords);
  if ("text" in card) add("text", card.text, limits.textMaxWords);
  switch (card.type) {
    case "numbers":
      card.items.forEach((item, i) => add(`figure ${i + 1} label`, item.label, limits.labelMaxWords));
      break;
    case "captaincy":
      card.tiles?.forEach((t, i) => add(`tile ${i + 1} label`, t.label, limits.labelMaxWords));
      add("badge", card.badge, limits.badgeMaxWords);
      break;
    case "players":
      card.players.forEach((p, i) => add(`player ${i + 1} detail`, p.detail, limits.detailMaxWords));
      break;
    case "transfers":
      card.moves.forEach((m, i) => add(`move ${i + 1} detail`, m.detail, limits.detailMaxWords));
      break;
    case "notes":
      card.items.forEach((n, i) => add(`note ${i + 1}`, n.text, limits.noteMaxWords));
      break;
    case "matches":
      break;
  }
  return out;
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
