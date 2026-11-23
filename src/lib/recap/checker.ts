// The checker: decides, without any AI, whether a recap says only what the
// tools returned. Its messages go back to the agent, so each one names the
// exact words at fault and what to do about them.
//
// What it verifies:
// - Numbers. Every number in the text (points, prices, percentages, scores,
//   counts, "twice", "hat-trick") must be in a tool result. A claim's numbers
//   must be in the results that claim cites. Numbers in the headline and
//   paragraphs must also be stated by a claim.
// - Whose number it is. Tool results keep each player's numbers inside that
//   player's object, so a sentence about one player can't borrow another
//   player's figure, and a score next to a club must be one of that club's
//   results. This is what catches two players' stats being swapped.
// - Names. Every player or club named must be in a tool result. Any other
//   capitalised name (a manager, a pundit, a stadium, an FPL manager's real
//   name) is rejected, since nothing in the data could have supplied it.
// - Content. Length limits; nothing about betting or odds; no links; no
//   quotes.
//
// What it can't see: a claim that is false but uses only true numbers about
// the right player ("his first goal" when it was his third), and a lone
// unknown surname as the first word of a sentence, which can't be told from an
// ordinary capitalised word. Those are for the quality review and the person
// approving the recap.

import type { NameEntry } from "./context";
import type { NameIndex, NameMention } from "./names";
import { extractNumbers, numberToken, numbersAgree, type NumberToken } from "./numbers";
import {
  RECAP_LIMITS,
  type CheckIssue,
  type CheckReport,
  type EvidenceEntry,
  type RecapDraft,
  type RecapLimits,
} from "./recap";

export interface CheckOptions {
  /** "2026-27" */
  season: string;
  gameweek: number;
  /** Every tool call the agent made. Failed calls and submit_recap calls are not evidence. */
  evidence: readonly EvidenceEntry[];
  names: NameIndex;
  /** The same dictionary as `names`, to name players in messages. */
  nameEntries: readonly NameEntry[];
  limits?: Partial<RecapLimits>;
  /** Real names that must never appear, e.g. the members of a mini-league. Matched ignoring case. */
  forbiddenNames?: readonly string[];
  /** Numbers in the headline and paragraphs must also appear in a claim. Default true. */
  requireClaimCoverage?: boolean;
}

/** A number in a tool result, and the players it describes (null: no player in particular). */
interface Fact {
  token: NumberToken;
  owners: readonly number[] | null;
}

interface MatchResult {
  homeId: number | null;
  awayId: number | null;
  /** "Arsenal 2-1 Chelsea" */
  text: string;
  /** Set when the result says which gameweek the match was in (season lists do). */
  gameweek: number | null;
  token: NumberToken;
  owners: readonly number[] | null;
}

/** Everything one tool result says, indexed for checking. */
interface ResultFacts {
  id: string;
  numbers: Fact[];
  matches: MatchResult[];
  players: Set<number>;
  teams: Set<number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a tool result, following the conventions in tools/shared.ts. */
function readResult(entry: EvidenceEntry, names: NameIndex): ResultFacts {
  const facts: ResultFacts = { id: entry.id, numbers: [], matches: [], players: new Set(), teams: new Set() };

  const walk = (value: unknown, owners: readonly number[] | null): void => {
    if (typeof value === "number") {
      facts.numbers.push({ token: numberToken(value), owners });
    } else if (typeof value === "string") {
      for (const token of extractNumbers(value)) facts.numbers.push({ token, owners });
      for (const mention of names.scan(value).mentions) {
        const seen = mention.kind === "team" ? facts.teams : facts.players;
        for (const id of mention.ids) seen.add(id);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, owners);
    } else if (isRecord(value)) {
      let own = owners;
      if (typeof value.player === "string") {
        // A player's object: every number inside it is about that player.
        const ref = typeof value.ref === "string" ? /^p(\d+)$/.exec(value.ref) : null;
        own = ref ? [Number(ref[1])] : names.lookupPlayer(value.player);
        for (const id of own) facts.players.add(id);
      }
      if (typeof value.home === "string" && typeof value.away === "string" && typeof value.score === "string") {
        const token = extractNumbers(value.score).find((t) => t.kind === "score");
        if (token) {
          facts.matches.push({
            homeId: names.lookupTeam(value.home),
            awayId: names.lookupTeam(value.away),
            text: `${value.home} ${value.score} ${value.away}`,
            gameweek: typeof value.gameweek === "number" ? value.gameweek : null,
            token,
            owners: own,
          });
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === "ref" || key === "player") continue;
        walk(child, own);
      }
    }
  };
  walk(entry.result, null);
  return facts;
}

const BETTING =
  /\b(?:bet|bets|betting|bettors?|bookmakers?|bookies?|odds|odds-on|wagers?|wagered|wagering|gambl\w*|sportsbooks?|accumulators?|acca|each-way|punters?)\b/gi;
/** Fractional odds such as "5/1", but not a season such as "2026/27". */
const FRACTIONAL_ODDS = /(?<![\d/])\d{1,3}\/\d{1,2}(?![\d/])/g;
const LINK =
  /https?:\/\/\S+|\bwww\.\S+|\[[^\]]+\]\([^)]*\)|\b[\w.+-]+@[\w-]+\.\w+|\b[a-z0-9-]+\.(?:com|co\.uk|org|net|io|app|tv|gg|uk)\b/gi;
/** A quoted passage of a few words or more: nobody in the data said anything. */
const QUOTE = /["“][^"“”]{12,}["”]/g;

interface Sentence {
  start: number;
  end: number;
}

/** Splits at sentence punctuation followed by a space and a capital. Decimals and "B.Fernandes" don't split. */
function sentencesOf(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]["'”’)\]]*\s+(?=["'“‘(\[]*\p{Lu})/gu)) {
    const end = match.index + match[0].trimEnd().length;
    sentences.push({ start, end });
    start = match.index + match[0].length;
  }
  if (start < text.length) sentences.push({ start, end: text.length });
  return sentences;
}

const quoted = (text: string) => `"${text.trim()}"`;

function excerpt(text: string, sentence: Sentence): string {
  const s = text.slice(sentence.start, sentence.end).trim();
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

const list = (items: readonly string[], max = 4) =>
  items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");

export function checkRecap(draft: RecapDraft, options: CheckOptions): CheckReport {
  const limits: RecapLimits = { ...RECAP_LIMITS, ...options.limits };
  const { names } = options;
  const issues: CheckIssue[] = [];
  const seen = new Set<string>();
  const report = (code: string, where: string, message: string) => {
    const key = `${code}|${where}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, where, message });
  };
  let numbersChecked = 0;
  let namesChecked = 0;
  /** Numbers already reported as absent from the evidence, so they aren't reported twice. */
  const unsupported = new Set<string>();

  const playerNames = new Map<number, string>();
  const teamNames = new Map<number, string>();
  for (const entry of options.nameEntries) {
    if (entry.kind === "player") playerNames.set(entry.id, entry.webName);
    else teamNames.set(entry.id, entry.name);
  }

  const usable = options.evidence.filter((e) => e.ok && e.tool !== "submit_recap");
  const allFacts = usable.map((e) => readResult(e, names));
  const factsById = new Map(allFacts.map((f) => [f.id, f]));

  // ---- Length ------------------------------------------------------------
  const headline = draft.headline.trim();
  if (headline.length < limits.headlineMinChars || headline.length > limits.headlineMaxChars) {
    report(
      "length",
      "headline",
      `The headline is ${headline.length} characters. Keep it between ${limits.headlineMinChars} and ${limits.headlineMaxChars}.`,
    );
  }
  if (draft.paragraphs.length < limits.minParagraphs || draft.paragraphs.length > limits.maxParagraphs) {
    report(
      "length",
      "recap",
      `The recap has ${draft.paragraphs.length} paragraphs. Write between ${limits.minParagraphs} and ${limits.maxParagraphs}.`,
    );
  }
  draft.paragraphs.forEach((paragraph, i) => {
    if (paragraph.trim().length === 0) report("length", `paragraph ${i + 1}`, "This paragraph is empty.");
    if (paragraph.length > limits.paragraphMaxChars) {
      report(
        "length",
        `paragraph ${i + 1}`,
        `This paragraph is ${paragraph.length} characters. Keep each paragraph under ${limits.paragraphMaxChars}.`,
      );
    }
  });
  const words = draft.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  if (words < limits.minWords || words > limits.maxWords) {
    report(
      "length",
      "recap",
      `The paragraphs total ${words} words. Write between ${limits.minWords} and ${limits.maxWords}.`,
    );
  }
  if (draft.claims.length < limits.minClaims || draft.claims.length > limits.maxClaims) {
    report(
      "length",
      "recap",
      `There are ${draft.claims.length} claims. Give between ${limits.minClaims} and ${limits.maxClaims}.`,
    );
  }

  // ---- One piece of text against the results it may draw on ----------------
  const checkText = (where: string, text: string, scope: readonly ResultFacts[], cited: readonly string[] | null) => {
    const source = cited ? `the results this claim cites (${cited.join(", ") || "none"})` : "any tool result";

    for (const match of text.matchAll(BETTING)) {
      report("betting", where, `Remove ${quoted(match[0])}: a recap must not mention betting or odds.`);
    }
    for (const match of text.matchAll(FRACTIONAL_ODDS)) {
      report("betting", where, `Remove ${quoted(match[0])}: it reads as betting odds, which a recap must not mention.`);
    }
    for (const match of text.matchAll(LINK)) {
      report("link", where, `Remove ${quoted(match[0])}: a recap must not contain links or addresses.`);
    }
    for (const match of text.matchAll(QUOTE)) {
      report("quote", where, `Remove the quotation ${match[0]}: the data contains no quotes, so a recap can't have any.`);
    }
    for (const name of options.forbiddenNames ?? []) {
      if (name.trim() && text.toLowerCase().includes(name.trim().toLowerCase())) {
        report("real-name", where, `Remove ${quoted(name)}: a recap must never give a manager's real name.`);
      }
    }

    // Names.
    const scan = names.scan(text);
    if (scan.unknown.length > 0) {
      report(
        "unknown-name",
        where,
        `${list(scan.unknown.map((u) => quoted(u.text)))} ${scan.unknown.length === 1 ? "is" : "are"} not a player or club in the data. ` +
          "Only name players and clubs that a tool returned: no managers (of clubs or of FPL teams), pundits, stadiums, " +
          "nationalities or other competitions. Name players the way the tools do, and write ordinary words in lower " +
          "case (sentence case, not Title Case).",
      );
    }
    const inScope = (mention: NameMention, ids: readonly number[]) =>
      ids.filter((id) => scope.some((f) => (mention.kind === "team" ? f.teams : f.players).has(id)));
    /** The mentions that really are names here, each narrowed to who it means given the evidence. */
    const mentions: { mention: NameMention; ids: number[] }[] = [];
    for (const mention of scan.mentions) {
      const exact = inScope(mention, mention.exactIds);
      const ids = exact.length > 0 ? exact : inScope(mention, mention.ids);
      if (ids.length > 0) {
        namesChecked++;
        mentions.push({ mention, ids });
        continue;
      }
      // A capitalised first word that is only maybe a name: let it go.
      if (mention.weak) continue;
      namesChecked++;
      const elsewhere = cited
        ? allFacts
            .filter((f) => mention.ids.some((id) => (mention.kind === "team" ? f.teams : f.players).has(id)))
            .map((f) => f.id)
        : [];
      const lookUp = mention.kind === "team" ? "the club up with team_story" : "the player up with player_story or find_players";
      report(
        "name-not-in-evidence",
        where,
        elsewhere.length > 0
          ? `${quoted(mention.text)} is not in ${source}. It is in ${list(elsewhere)}: cite that result too, or drop the name from this claim.`
          : `${quoted(mention.text)} is not in any tool result. Look ${lookUp} first, or leave the name out.`,
      );
    }

    // Numbers.
    const sentences = sentencesOf(text);
    for (const token of extractNumbers(text)) {
      numbersChecked++;
      const sentence = sentences.find((s) => token.start >= s.start && token.start < s.end) ?? { start: 0, end: text.length };
      const here = mentions.filter((m) => m.mention.start >= sentence.start && m.mention.start < sentence.end);
      const players = here.filter((m) => m.mention.kind === "player");
      const context = `in "${excerpt(text, sentence)}"`;

      if (token.kind === "season") {
        const written = `${token.value}-${String(token.other).padStart(2, "0")}`;
        if (written !== options.season) {
          report("season", where, `${quoted(token.text)} is not this season (${options.season.replace("-", "/")}).`);
        }
        continue;
      }

      if (token.kind === "gameweek") {
        // Earlier gameweeks are fair game (their facts are checked like any
        // other); a later one is something no tool could have described.
        if (token.value < 1 || token.value > options.gameweek) {
          report(
            "number-not-in-evidence",
            where,
            `${quoted(token.text)} ${context}: this recap is about gameweek ${options.gameweek}, and the tools know nothing later than that.`,
          );
        }
        continue;
      }

      if (token.kind === "score") {
        // A result from an earlier gameweek (a season list) only counts when
        // the sentence says which gameweek it means.
        const named = new Set(
          extractNumbers(text.slice(sentence.start, sentence.end))
            .filter((t) => t.kind === "gameweek")
            .map((t) => t.value),
        );
        const results = scope
          .flatMap((f) => f.matches)
          .filter((r) => r.gameweek === null || r.gameweek === options.gameweek || named.has(r.gameweek));
        const clubs = new Set(here.filter((m) => m.mention.kind === "team").flatMap((m) => m.ids));
        const people = new Set(players.flatMap((m) => m.ids));
        const has = (id: number | null) => id !== null && clubs.has(id);
        // With both sides named ("Arsenal beat Chelsea 2-1") it must be that
        // match; with one, any of that club's matches this gameweek.
        const between = results.filter((r) => has(r.homeId) && has(r.awayId));
        const ofClubs = between.length > 0 ? between : results.filter((r) => has(r.homeId) || has(r.awayId));
        const ofPeople = results.filter((r) => r.owners?.some((id) => people.has(id)));
        // The score must belong to a club or player the sentence names. A
        // sentence that names neither can use any result in the evidence.
        const anchored = clubs.size > 0 || ofPeople.length > 0;
        const pool = anchored ? [...ofClubs, ...ofPeople] : results;
        const ok =
          pool.some((r) => numbersAgree(token, r.token)) ||
          (!anchored && scope.some((f) => f.numbers.some((n) => numbersAgree(token, n.token))));
        if (!ok) {
          const about = [...clubs].map((id) => teamNames.get(id) ?? "that club");
          const have = [...new Set(pool.map((r) => r.text))];
          report(
            "wrong-score",
            where,
            `The score ${quoted(token.text)} ${context} does not match ${source}` +
              (about.length ? ` for ${list(about)}` : "") +
              (have.length
                ? `. The results there are: ${list(have, 6)}.`
                : ". No result for them is there: call team_story or gameweek_summary first."),
          );
        }
        continue;
      }

      const agreeing = scope.flatMap((f) => f.numbers.filter((n) => numbersAgree(token, n.token)));
      if (agreeing.length === 0) {
        const elsewhere = cited
          ? allFacts.filter((f) => f.numbers.some((n) => numbersAgree(token, n.token))).map((f) => f.id)
          : [];
        const otherKind = scope
          .flatMap((f) => f.numbers)
          .find((n) => n.token.kind !== token.kind && n.token.kind !== "score" && Math.abs(n.token.value - token.value) < 1e-9);
        unsupported.add(`${where}|${token.text}`);
        report(
          cited ? "number-not-cited" : "number-not-in-evidence",
          where,
          `${quoted(token.text)} ${context} is not in ${source}.` +
            (elsewhere.length > 0
              ? ` It is in ${list(elsewhere)}: cite that result, or correct the number.`
              : otherKind
                ? ` The evidence has ${quoted(otherKind.token.text)}: write it the same way.`
                : " Use only numbers a tool returned, exactly as returned: don't add, subtract, average or estimate."),
        );
        continue;
      }

      // Whose number is it? In "Saka (12 points)", it has to be Saka's.
      if (players.length === 0) continue;
      const tight = players.find(
        (m) => m.mention.end <= token.start && /^(?:['’]s)?\s*\([^()]*$/.test(text.slice(m.mention.end, token.start)),
      );
      const subjects = tight ? [tight] : players;
      const about = new Set(subjects.flatMap((m) => m.ids));
      if (agreeing.some((n) => n.owners === null || n.owners.some((id) => about.has(id)))) continue;

      const owners = [...new Set(agreeing.flatMap((n) => n.owners ?? []))].map((id) => playerNames.get(id) ?? "another player");
      report(
        "wrong-player",
        where,
        `${quoted(token.text)} ${context}: in ${source} that figure belongs to ${list(owners)}, not ` +
          `${list([...new Set(subjects.map((m) => m.mention.text))])}. Check which player it describes and correct the sentence.`,
      );
    }
  };

  // ---- Headline and paragraphs: against everything -------------------------
  checkText("headline", draft.headline, allFacts, null);
  draft.paragraphs.forEach((paragraph, i) => checkText(`paragraph ${i + 1}`, paragraph, allFacts, null));

  // ---- Claims: against the results they cite -------------------------------
  draft.claims.forEach((claim, i) => {
    const where = `claim ${i + 1}`;
    if (claim.text.length > limits.claimMaxChars) {
      report(
        "length",
        where,
        `This claim is ${claim.text.length} characters. Keep each claim under ${limits.claimMaxChars}: one statement per claim.`,
      );
    }
    if (claim.evidence.length > limits.maxEvidencePerClaim) {
      report(
        "length",
        where,
        `This claim cites ${claim.evidence.length} results. Cite at most ${limits.maxEvidencePerClaim}: split the claim.`,
      );
    }
    const scope: ResultFacts[] = [];
    for (const id of new Set(claim.evidence)) {
      const facts = factsById.get(id);
      if (facts) {
        scope.push(facts);
        continue;
      }
      const entry = options.evidence.find((e) => e.id === id);
      report(
        "unknown-result",
        where,
        !entry
          ? `It cites ${id}, which is not a result id from this session.`
          : entry.tool === "submit_recap"
            ? `It cites ${id}, a submit_recap call. Cite the tool results the facts came from.`
            : `It cites ${id}, a call that failed and returned no data.`,
      );
    }
    checkText(where, claim.text, scope, claim.evidence);
  });

  // ---- Every number in the prose is backed by a claim ----------------------
  if (options.requireClaimCoverage ?? true) {
    const claimed = draft.claims.flatMap((c) => extractNumbers(c.text));
    const parts: [string, string][] = [
      ["headline", draft.headline],
      ...draft.paragraphs.map((p, i): [string, string] => [`paragraph ${i + 1}`, p]),
    ];
    for (const [where, text] of parts) {
      for (const token of extractNumbers(text)) {
        if (token.kind === "gameweek" || token.kind === "season") continue;
        if (unsupported.has(`${where}|${token.text}`)) continue;
        if (claimed.some((c) => numbersAgree(token, c) || numbersAgree(c, token))) continue;
        report(
          "number-without-claim",
          where,
          `${quoted(token.text)} is not backed by a claim. Add a claim that states it and cites the result it came from.`,
        );
      }
    }
  }

  return { passed: issues.length === 0, issues, numbersChecked, namesChecked };
}
