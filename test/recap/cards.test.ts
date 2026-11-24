import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cardStatements,
  formatCount,
  formatNumbersInText,
  formatPercent,
  type RecapCard,
} from "../../src/lib/recap/cards";
import { checkRecap, type CheckOptions } from "../../src/lib/recap/checker";
import { cardRecapSchema, recapDraftSchema, type CardRecap, type CheckReport, type RecapDraft } from "../../src/lib/recap/recap";
import { createRecapSession } from "../../src/lib/recap/session";
import { recapSummary, recapTextBlocks, recapToText } from "../../src/lib/recap/text";
import { nameIndexOf } from "../../src/lib/recap/tools/shared";
import { loadContext } from "./helpers";

// The version 2 recap: story cards, each citing the results it was built
// from. The sample is a hand-written card recap of the recorded GW4
// (test/fixtures/recap/sample-recap.json), with the evidence log of the tool
// calls it was written from.

const SAMPLE_FILE = path.join(__dirname, "..", "fixtures", "recap", "sample-recap.json");
const loadSample = (): CardRecap => cardRecapSchema.parse(JSON.parse(readFileSync(SAMPLE_FILE, "utf8")));

const context = loadContext(4);
const sample = loadSample();
const options: CheckOptions = {
  season: context.season,
  gameweek: context.gameweek,
  evidence: sample.evidence,
  names: nameIndexOf(context),
  nameEntries: context.names,
};

const draftOf = (recap: CardRecap): RecapDraft => structuredClone({ headline: recap.headline, cards: recap.cards });

/** The sample with one thing changed. */
function broken(edit: (draft: RecapDraft) => void, extra: Partial<CheckOptions> = {}): CheckReport {
  const draft = draftOf(sample);
  edit(draft);
  return checkRecap(draft, { ...options, ...extra });
}

/** The sample's card of a type (the first, or the nth). */
function cardOf<T extends RecapCard["type"]>(draft: RecapDraft, type: T, nth = 0): Extract<RecapCard, { type: T }> {
  const card = draft.cards.filter((c) => c.type === type)[nth];
  if (!card) throw new Error(`The sample has no ${type} card ${nth + 1}.`);
  return card as Extract<RecapCard, { type: T }>;
}

const codes = (report: CheckReport) => [...new Set(report.issues.map((i) => i.code))].sort();
const messages = (report: CheckReport, code: string) =>
  report.issues.filter((i) => i.code === code).map((i) => `${i.where}: ${i.message}`);

describe("the sample card recap", () => {
  it("is a valid version 2 recap that passes the checker", () => {
    const report = checkRecap(draftOf(sample), options);
    expect(report.issues).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.numbersChecked).toBeGreaterThan(30);
    expect(report.namesChecked).toBeGreaterThan(30);
    expect(sample.checks).toEqual(report);
    expect(sample).toMatchObject({ version: 2, season: "2026-27", gameweek: 4, model: "hand-written" });
    expect(new Set(sample.cards.map((c) => c.type))).toEqual(
      new Set(["numbers", "captaincy", "players", "matches", "transfers", "notes"]),
    );
  });

  it("has an evidence log the tools still produce", () => {
    // If a tool's output changes on purpose, refresh the sample's evidence and checks with:
    //   UPDATE_SAMPLE_RECAP=1 npx vitest run test/recap/cards.test.ts
    // then copy it to test/fixtures/recaps/2026-27/gw04.json.
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    if (process.env.UPDATE_SAMPLE_RECAP) {
      const updated = { ...sample, evidence: session.evidence, checks: session.check(draftOf(sample)) };
      writeFileSync(SAMPLE_FILE, `${JSON.stringify(cardRecapSchema.parse(updated), null, 2)}\n`);
    }
    expect(session.evidence).toEqual(loadSample().evidence);
    expect(sample.usage.toolCalls).toBe(sample.evidence.length);
  });

  it("is what submit_recap takes", () => {
    expect(recapDraftSchema.safeParse(draftOf(sample)).success).toBe(true);
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    expect(session.call("submit_recap", draftOf(sample)).result).toMatchObject({ accepted: true });
  });
});

describe("made-up and misattributed numbers on cards", () => {
  it("rejects an invented number in a player's points", () => {
    const report = broken((d) => {
      cardOf(d, "players", 1).players[0].points = 19; // Schade scored 15
    });
    expect(report.passed).toBe(false);
    expect(messages(report, "number-not-cited")).toEqual([
      expect.stringMatching(/^card 5 \(players\), player 1: "19" in "Schade scored 19 points\." is not in the results this card cites \(r6\)/),
    ]);
  });

  it("rejects another player's points on a player's row, though the number is in the cited result", () => {
    const report = broken((d) => {
      cardOf(d, "players", 1).players[2].points = 15; // Belloumi scored 13; 15 is Schade's and Bogle's
    });
    expect(codes(report)).toEqual(["wrong-player"]);
    expect(messages(report, "wrong-player")[0]).toMatch(/^card 5 \(players\), player 3: "15 points" .* belongs to Schade, Bogle, not Belloumi/);
  });

  it("rejects another player's ownership", () => {
    const report = broken((d) => {
      cardOf(d, "players", 1).players[0].ownership = 2.2; // Bogle's
    });
    expect(report.passed).toBe(false);
    expect(report.issues[0].where).toBe("card 5 (players), player 1 ownership");
  });

  it("rejects a stat line that isn't the player's", () => {
    const report = broken((d) => {
      cardOf(d, "players", 1).players[1].detail = "2 goals"; // Bogle scored 1
    });
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.where)).toEqual(["card 5 (players), player 2 detail"]);
  });

  it("rejects a figure the card doesn't cite, and says where it is", () => {
    const report = broken((d) => {
      cardOf(d, "players", 1).evidence = ["r3"];
    });
    expect(codes(report)).toContain("name-not-in-evidence");
    expect(messages(report, "name-not-in-evidence")[0]).toMatch(/is not in the results this card cites \(r3\)\. It is in r\d/);
  });

  it("ties a captaincy tile to the captain, or to the player it names", () => {
    // 28 is Raya's captain score, not Haaland's.
    expect(
      broken((d) => {
        delete cardOf(d, "captaincy").tiles![2].player;
        delete cardOf(d, "captaincy").tiles![2].ref;
      }).passed,
    ).toBe(false);
    // 18 as captain is Haaland's, not Raya's.
    const report = broken((d) => {
      const tile = cardOf(d, "captaincy").tiles![0];
      tile.player = "Raya";
      tile.ref = "p1";
    });
    expect(report.passed).toBe(false);
    expect(report.issues[0].where).toBe("card 2 (captaincy), tile 1");
  });

  it("rejects a run the player didn't have", () => {
    // (Any of the player's runs of that length passes: a run of 4 would match his 4 gameweeks in a row with minutes.)
    const report = broken((d) => {
      cardOf(d, "transfers").moves[1].run = { kind: "blanks", gameweeks: 3 };
    });
    expect(report.passed).toBe(false);
    expect(report.issues[0].where).toBe("card 6 (transfers), move 2 run");
  });

  it("rejects wrong net transfers", () => {
    expect(broken((d) => void (cardOf(d, "transfers").moves[0].netTransfers = 1039939)).passed).toBe(false);
    // Rogers's net transfers in, given to B.Fernandes.
    const report = broken((d) => void (cardOf(d, "transfers").moves[1].netTransfers = 1039938));
    expect(codes(report)).toEqual(["wrong-player"]);
  });

  it("rejects a wrong score and another match's score", () => {
    expect(codes(broken((d) => void (cardOf(d, "matches").matches[0].score = "0-4")))).toEqual(["wrong-score"]);
    expect(codes(broken((d) => void (cardOf(d, "matches").matches[1].score = "0-5")))).toEqual(["wrong-score"]);
  });

  it("checks the numbers strip against gameweek figures", () => {
    expect(codes(broken((d) => void (cardOf(d, "numbers").items[0].value = "70")))).toEqual(["number-not-cited"]);
  });

  it("checks a card's line like the prose of a version 1 recap", () => {
    const report = broken((d) => {
      cardOf(d, "matches").text = "Groß (12 points) had the top score of the gameweek.";
    });
    expect(codes(report)).toEqual(["wrong-player"]);
    expect(broken((d) => void (cardOf(d, "matches").text = "Guardiola's side were rested.")).issues.map((i) => i.code)).toContain(
      "unknown-name",
    );
    expect(codes(broken((d) => void (cardOf(d, "transfers").text = "The odds were short.")))).toEqual(["betting"]);
  });

  it("reads a note that follows its player's name as that player's", () => {
    expect(codes(broken((d) => void (cardOf(d, "notes").items[1].text = "was in 41.7% of squads")))).not.toEqual([]);
    expect(broken((d) => void (cardOf(d, "notes").items[1].points = 2)).passed).toBe(false);
  });

  it("rejects a number in the headline that is on no card", () => {
    // 17 is in the matches card's line.
    expect(broken((d) => void (d.headline = "Groß's 17 points lead Brighton's rout")).passed).toBe(true);
    // Palmer's 5 points are in the evidence, but on no card.
    const missing = broken((d) => void (d.headline = "Rogers rewards the bandwagon, Palmer gets 5 points"));
    expect(messages(missing, "number-without-card")).toEqual([
      expect.stringMatching(/^headline: "5" is in the headline but on no card/),
    ]);
  });
});

describe("player refs", () => {
  it("must be the player named with them", () => {
    const report = broken((d) => void (cardOf(d, "players", 1).players[0].ref = "p330"));
    expect(messages(report, "player-ref")).toEqual([
      'card 5 (players), player 1: The ref p330 is Bogle, not "Schade". Give the name and ref a tool returned together.',
    ]);
    expect(messages(broken((d) => void (cardOf(d, "players", 1).players[0].ref = "p99999")), "player-ref")[0]).toMatch(
      /p99999 is not a player in the data/,
    );
  });

  it("are needed when a tile or note names a player", () => {
    const report = broken((d) => void delete cardOf(d, "captaincy").tiles![2].ref);
    expect(messages(report, "player-ref")).toEqual([
      'card 2 (captaincy), tile 3: Give "Raya"\'s ref (such as "p411") from the tool results.',
    ]);
  });
});

describe("card limits", () => {
  it("are reported in words the agent can act on", () => {
    const report = broken((d) => {
      d.headline = "Groß";
      d.cards = d.cards.slice(0, 3);
      cardOf(d, "numbers").items = cardOf(d, "numbers").items.slice(0, 1);
      cardOf(d, "captaincy").text = "word ".repeat(30).trim();
      cardOf(d, "captaincy").evidence = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];
    });
    expect(messages(report, "length")).toEqual([
      "headline: The headline is 4 characters. Keep it between 10 and 90.",
      "recap: The recap has 3 cards. Give between 4 and 7.",
      "card 1 (numbers): This card has 1 figure. Give between 2 and 4.",
      "card 2 (captaincy): This card cites 7 results. Cite at most 6: split the card, or drop what isn't needed.",
      "card 2 (captaincy), text: This is 30 words. Keep it to 25 words at most.",
    ]);
  });

  it("allow one numbers card and one captaincy card, and no points in a note without a player", () => {
    const report = broken((d) => {
      d.cards.splice(1, 1, cardOf(d, "numbers"));
      cardOf(d, "notes").items[0].points = 6;
    });
    expect(codes(report)).toEqual(["card-field", "card-type"]);
  });

  it("refuse a run of one gameweek", () => {
    expect(codes(broken((d) => void (cardOf(d, "transfers").moves[1].run = { kind: "blanks", gameweeks: 1 })))).toContain("length");
  });

  it("must cite real, successful tool results", () => {
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    session.call("player_story", { player: "Nobody At All" }); // r8, fails
    const draft = draftOf(sample);
    cardOf(draft, "numbers").evidence = ["r1", "r8", "r99"];
    expect(messages(session.check(draft), "unknown-result")).toEqual([
      "card 1 (numbers): It cites r8, a call that failed and returned no data.",
      "card 1 (numbers): It cites r99, which is not a result id from this session.",
    ]);
  });
});

describe("cardStatements", () => {
  it("gives each figure a sentence naming whose it is", () => {
    const players = cardOf(draftOf(sample), "players", 1);
    expect(cardStatements(players, "card 5").map((s) => s.text)).toEqual([
      "Hardly anyone had them",
      "Schade scored 15 points.",
      "Schade was owned by 3.5%.",
      "Schade: 2 goals.",
      "Bogle scored 15 points.",
      "Bogle was owned by 2.2%.",
      "Bogle: 1 goal.",
      "Belloumi scored 13 points.",
      "Belloumi was owned by 1.0%.",
      "Belloumi: 2 goals.",
    ]);
    const transfers = cardOf(draftOf(sample), "transfers");
    expect(cardStatements(transfers, "card 6").map((s) => s.text)).toContain("B.Fernandes blanked in 2 gameweeks in a row.");
    expect(cardStatements(transfers, "card 6").map((s) => s.text)).toContain("Rogers: 1,039,938 net transfers in.");
  });
});

describe("recapToText", () => {
  it("renders the headline and a block per card, with thousands separators", () => {
    const text = recapToText(sample);
    expect(text.split("\n")[0]).toBe(`# ${sample.headline}`);
    expect(recapTextBlocks(sample)).toHaveLength(sample.cards.length);
    expect(text).toContain("In numbers: 69 average score, 151 highest manager score, 29 goals and 10 matches.");
    expect(text).toContain("The captaincy: Haaland scored 9 points, owned by 71.3%. That meant 18 as captain, 27 as Triple Captain and Raya 28 as captain.");
    expect(text).toContain("Hardly anyone had them: Schade scored 15 points (2 goals), owned by 3.5%.");
    expect(text).toContain("Brighton ran riot: Coventry City 0-5 Brighton and Leeds 4-1 Newcastle.");
    expect(text).toContain("The transfer market: Rogers had 1,039,938 net transfers in and scored 8 points. B.Fernandes had 615,807 net transfers out and scored 2 points (2 blanks in a row).");
    expect(text).toContain("Also worth knowing: 760,682 managers played their Wildcard");
    expect(text).toContain("Calafiori was in 49.6% of squads (6 points).");
    expect(text).not.toMatch(/\d{5,}/);
  });

  it("renders a version 1 recap's paragraphs, fixing long numbers", () => {
    const v1 = { headline: "A headline", paragraphs: ["João Pedro lost another 1318707 net transfers.", "In 2026/27, 29 goals."] };
    expect(recapToText(v1)).toBe("# A headline\n\nJoão Pedro lost another 1,318,707 net transfers.\n\nIn 2026/27, 29 goals.");
    expect(recapSummary(v1)).toBe("João Pedro lost another 1,318,707 net transfers.");
  });

  it("summarises a card recap with its cards' lines, or its first story cards when none has one", () => {
    expect(recapSummary(sample)).toBe(
      "A steady return from the armband, but Raya was the better pick among the most-owned. " +
        "Groß (17 points) had the top score of the gameweek, and Bogle (15 points) led the way for Leeds. " +
        "The bandwagon paid off. The sellers of B.Fernandes were proved right.",
    );
    const noLines = { headline: sample.headline, cards: sample.cards.map((c) => ({ ...c, text: undefined })) };
    expect(recapSummary(noLines)).toMatch(/^The captaincy: Haaland scored 9 points, .* Brighton ran riot: /);
  });
});

describe("number formatting", () => {
  it("adds thousands separators", () => {
    expect(formatCount(1318707)).toBe("1,318,707");
    expect(formatCount(-2)).toBe("-2");
    expect(formatCount(55)).toBe("55");
    expect(formatPercent(9)).toBe("9.0%");
    expect(formatPercent(79.5)).toBe("79.5%");
  });

  it("fixes long whole numbers in free text, and leaves everything else alone", () => {
    expect(formatNumbersInText("1318707 out, 845,368 in")).toBe("1,318,707 out, 845,368 in");
    expect(formatNumbersInText("12345 and 9999")).toBe("12,345 and 9,999");
    expect(formatNumbersInText("the 2026/27 season, 2026-27, in 2026")).toBe("the 2026/27 season, 2026-27, in 2026");
    expect(formatNumbersInText("£12.0m, 16.3%, 0.12345, 3-1, Gameweek 10")).toBe("£12.0m, 16.3%, 0.12345, 3-1, Gameweek 10");
  });
});

describe("a club's run on a card", () => {
  it('reads "4 wins in a row" as a run, not a count of wins (GW7: Brighton)', async () => {
    const { loadRecording } = await import("../../scripts/recorded-gameweeks");
    const gw7 = loadRecording().context(7);
    const session = createRecapSession(gw7);
    const summary = session.call("gameweek_summary", {});
    const team = session.call("team_story", { team: "Brighton" });
    const runs = (team.result as { currentRun?: { winsInARow?: number } }).currentRun?.winsInARow;
    const card = (line: string): RecapDraft => ({
      headline: "Brighton keep on winning",
      cards: [{ type: "matches", matches: [{ home: "Brighton", away: "Crystal Palace", score: "5-0" }], text: line, evidence: [summary.id, team.id] }],
    });
    const check = (line: string) =>
      checkRecap(card(line), { season: gw7.season, gameweek: 7, evidence: session.evidence, names: nameIndexOf(gw7), nameEntries: gw7.names, limits: { minCards: 1 } });
    expect(runs).toBe(4);
    expect(check("Brighton made it 4 wins in a row.").issues).toEqual([]);
    // (5 would pass: they are unbeaten in 5, and the checker reads every run as one stat.)
    expect(check("Brighton made it 6 wins in a row.").passed).toBe(false);
  });
});
