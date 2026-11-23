import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkRecap, type CheckOptions } from "../../src/lib/recap/checker";
import { recapSchema, type CheckReport, type Recap, type RecapDraft } from "../../src/lib/recap/recap";
import { createRecapSession } from "../../src/lib/recap/session";
import { nameIndexOf } from "../../src/lib/recap/tools/shared";
import { loadContext } from "./helpers";

const SAMPLE_FILE = path.join(__dirname, "..", "fixtures", "recap", "sample-recap.json");
const loadSample = (): Recap => recapSchema.parse(JSON.parse(readFileSync(SAMPLE_FILE, "utf8")));

// The sample is a hand-written recap of the recorded GW4, with the evidence
// log of the tool calls it was written from.
const context = loadContext(4);
const sample = loadSample();
const options: CheckOptions = {
  season: context.season,
  gameweek: context.gameweek,
  evidence: sample.evidence,
  names: nameIndexOf(context),
  nameEntries: context.names,
};

const draftOf = (recap: Recap): RecapDraft => ({
  headline: recap.headline,
  paragraphs: [...recap.paragraphs],
  claims: recap.claims.map((c) => ({ text: c.text, evidence: [...c.evidence] })),
});

/** The sample with one thing changed. */
function broken(edit: (draft: RecapDraft) => void, extra: Partial<CheckOptions> = {}): CheckReport {
  const draft = draftOf(sample);
  edit(draft);
  return checkRecap(draft, { ...options, ...extra });
}

/** Replaces text everywhere it appears: paragraphs and claims. */
function replaceAll(draft: RecapDraft, from: string, to: string): void {
  const count = [draft.headline, ...draft.paragraphs, ...draft.claims.map((c) => c.text)].filter((t) => t.includes(from)).length;
  if (count === 0) throw new Error(`The sample does not contain "${from}".`);
  draft.headline = draft.headline.replaceAll(from, to);
  draft.paragraphs = draft.paragraphs.map((p) => p.replaceAll(from, to));
  for (const claim of draft.claims) claim.text = claim.text.replaceAll(from, to);
}

const codes = (report: CheckReport) => [...new Set(report.issues.map((i) => i.code))].sort();
const messages = (report: CheckReport, code: string) =>
  report.issues.filter((i) => i.code === code).map((i) => `${i.where}: ${i.message}`);

describe("the sample recap", () => {
  it("is a valid saved recap that passes the checker", () => {
    const report = checkRecap(draftOf(sample), options);
    expect(report.issues).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.numbersChecked).toBeGreaterThan(40);
    expect(report.namesChecked).toBeGreaterThan(30);
    expect(sample.checks).toEqual(report);
    expect(sample).toMatchObject({ season: "2026-27", gameweek: 4, model: "hand-written" });
  });

  it("has an evidence log the tools still produce", () => {
    // Replays the logged calls against the recorded gameweek. If a tool's
    // output changes on purpose, refresh the sample's evidence and checks with:
    //   UPDATE_SAMPLE_RECAP=1 npx vitest run test/recap/checker.test.ts
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    if (process.env.UPDATE_SAMPLE_RECAP) {
      const updated = { ...sample, evidence: session.evidence, checks: session.check(draftOf(sample)) };
      writeFileSync(SAMPLE_FILE, `${JSON.stringify(recapSchema.parse(updated), null, 2)}\n`);
    }
    expect(session.evidence).toEqual(loadSample().evidence);
    expect(sample.usage.toolCalls).toBe(sample.evidence.length);
  });
});

describe("deliberately broken recaps", () => {
  it("rejects an invented number", () => {
    const report = broken((d) => replaceAll(d, "17 points", "19 points"));
    expect(report.passed).toBe(false);
    expect(codes(report)).toEqual(["number-not-cited", "number-not-in-evidence"]);
    expect(messages(report, "number-not-in-evidence")[0]).toMatch(/^paragraph 1: "19" in ".*17|^paragraph 1: "19" in "Groß was at the centre/);
    expect(messages(report, "number-not-in-evidence")[0]).toContain("is not in any tool result");
  });

  it("rejects a number worked out from the evidence rather than taken from it", () => {
    // 15 + 15 + 13 = 43: true, but no tool returned it.
    const report = broken((d) => {
      d.paragraphs[1] += " Between them they scored 43 points.";
    });
    expect(codes(report)).toEqual(["number-not-in-evidence"]);
    expect(report.issues[0].message).toContain("don't add, subtract, average or estimate");
  });

  it("rejects two players' stats swapped, though both numbers are in the cited result", () => {
    // Schade is owned by 3.5% and Bogle by 2.2%; both rows are in r2.
    const report = broken((d) => {
      d.claims[3].text = d.claims[3].text.replace("3.5%", "2.2%");
      d.claims[4].text = d.claims[4].text.replace("2.2%", "3.5%");
    });
    expect(report.passed).toBe(false);
    expect(codes(report)).toEqual(["wrong-player"]);
    expect(messages(report, "wrong-player")).toEqual([
      expect.stringMatching(/^claim 4: "2\.2%" .* belongs to Bogle, not Schade/),
      expect.stringMatching(/^claim 5: "3\.5%" .* belongs to Schade, not Bogle/),
    ]);
  });

  it("rejects swapped points in a sentence about one player each", () => {
    // Groß scored 17 and Dunk 12.
    const report = broken((d) => {
      d.paragraphs[0] = d.paragraphs[0].replace("17 points", "12 points").replace("with 12 points.", "with 17 points.");
    });
    expect(messages(report, "wrong-player")).toEqual([
      expect.stringMatching(/^paragraph 1: "12" .* not Groß/),
      expect.stringMatching(/^paragraph 1: "17" .* belongs to Groß.* not Dunk/),
    ]);
  });

  it("rejects swapped figures in brackets, even with both players in the sentence", () => {
    const good = broken((d) => {
      d.paragraphs[0] += " Groß (17 points) and Dunk (12 points) led the way.";
    });
    expect(good.issues).toEqual([]);
    const swapped = broken((d) => {
      d.paragraphs[0] += " Groß (12 points) and Dunk (17 points) led the way.";
    });
    expect(messages(swapped, "wrong-player")).toHaveLength(2);
  });

  it("rejects a player who was never looked up", () => {
    const seen = JSON.stringify(sample.evidence);
    const stranger = context.players.find(
      (p) => /^[A-Z][a-z]{4,}$/.test(p.name) && !seen.includes(`"${p.ref}"`) && nameIndexOf(context).lookupPlayer(p.name).length === 1,
    )!;
    const report = broken((d) => {
      d.paragraphs[3] += ` It was a quiet week for ${stranger.name}.`;
    });
    expect(codes(report)).toEqual(["name-not-in-evidence"]);
    expect(report.issues[0]).toMatchObject({ where: "paragraph 4" });
    expect(report.issues[0].message).toContain(`"${stranger.name}" is not in any tool result`);
    expect(report.issues[0].message).toContain("player_story or find_players");
  });

  it("rejects a name cited from the wrong result", () => {
    const report = broken((d) => {
      d.claims[9].evidence = ["r3"]; // Foden's red card is in r6, not in Groß's player_story.
    });
    expect(codes(report)).toEqual(["name-not-in-evidence"]);
    expect(messages(report, "name-not-in-evidence")[0]).toMatch(/"Foden" is not in the results this claim cites \(r3\)\. It is in r\d/);
  });

  it("rejects a wrong score", () => {
    const report = broken((d) => replaceAll(d, "5-0", "4-0"));
    expect(codes(report)).toEqual(["wrong-score"]);
    expect(messages(report, "wrong-score")[0]).toContain('The score "4-0"');
    expect(messages(report, "wrong-score")[0]).toContain("Coventry City 0-5 Brighton");
  });

  it("rejects another match's score: 2-2 was Chelsea's result, not Man City's", () => {
    const report = broken((d) => replaceAll(d, "Man City's 1-0 win", "Man City's 2-2 draw"));
    expect(codes(report)).toEqual(["wrong-score"]);
    expect(messages(report, "wrong-score")[0]).toContain("Man Utd 0-1 Man City");
  });

  it("accepts a score written from the other side", () => {
    expect(broken((d) => replaceAll(d, "5-0", "0-5")).issues).toEqual([]);
  });

  it("only accepts an earlier gameweek's score when the sentence says which gameweek", () => {
    // season_records (r7) lists Brighton 4-0 Aston Villa from gameweek 1.
    const add = (sentence: string) =>
      broken((d) => {
        d.paragraphs[0] += ` ${sentence}`;
        d.claims[0].text += ` ${sentence}`;
      });
    expect(add("Brighton had also won 4-0 in Gameweek 1.").issues).toEqual([]);
    expect(codes(add("Brighton also won 4-0."))).toEqual(["wrong-score"]);
  });

  it("rejects betting talk", () => {
    const report = broken((d) => {
      d.paragraphs[2] += " Haaland stays the best bet for the armband, at odds of 5/1 with the bookmakers.";
    });
    expect(codes(report)).toContain("betting");
    expect(messages(report, "betting").map((m) => /"([^"]+)"/.exec(m)![1])).toEqual(["bet", "odds", "bookmakers", "5/1"]);
  });

  it("rejects a club manager's name", () => {
    const report = broken((d) => replaceAll(d, "Haaland, the most-captained player,", "Haaland, trusted again by Pep Guardiola,"));
    expect(codes(report)).toEqual(["unknown-name"]);
    expect(report.issues[0].message).toContain('"Pep Guardiola" is not a player or club in the data');
    expect(report.issues[0].message).toContain("no managers");
  });

  it("rejects an FPL manager's real name", () => {
    const report = broken((d) => {
      d.paragraphs[3] += " The week's best manager was John Smith.";
    });
    expect(codes(report)).toEqual(["unknown-name"]);
    expect(report.issues[0].message).toContain('"John Smith"');
  });

  it("rejects a listed real name wherever and however it is written", () => {
    const report = broken(
      (d) => {
        d.paragraphs[3] += " Okonkwo-reyes topped the league this week.";
      },
      { forbiddenNames: ["Okonkwo-Reyes"] },
    );
    expect(codes(report)).toEqual(["real-name"]);
  });

  it("rejects links and quotes", () => {
    const report = broken((d) => {
      d.paragraphs[3] += ' See fantasyplstats.com or https://example.org/gw4. "We were fantastic today," he said.';
    });
    expect(codes(report)).toEqual(["link", "quote"]);
    expect(messages(report, "link")).toHaveLength(2);
  });

  it("rejects outside knowledge: stadiums, nationalities, other competitions", () => {
    const report = broken((d) => {
      d.paragraphs[2] += " The Norwegian has scored in the Champions League at the Etihad too.";
    });
    expect(codes(report)).toEqual(["unknown-name"]);
    expect(report.issues[0].message).toMatch(/"Norwegian", "Champions", "Etihad"/);
  });
});

describe("claims", () => {
  it("must cite results that hold their numbers", () => {
    // 69 is in gameweek_summary (r1) and season_records (r7), not in top_performers (r2).
    const report = broken((d) => {
      d.claims[11].evidence = ["r2"];
    });
    expect(codes(report)).toEqual(["number-not-cited"]);
    expect(messages(report, "number-not-cited")[0]).toMatch(/^claim 12: "69" .* is not in the results this claim cites \(r2\)\. It is in r1, r7/);
  });

  it("must cite real, successful tool results", () => {
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    session.call("player_story", { player: "Nobody At All" }); // r8, fails
    session.call("submit_recap", draftOf(sample)); // r9
    const draft = draftOf(sample);
    draft.claims[2].evidence = ["r1", "r8", "r9", "r99"];
    const report = session.check(draft);
    expect(messages(report, "unknown-result")).toEqual([
      "claim 3: It cites r8, a call that failed and returned no data.",
      "claim 3: It cites r9, a submit_recap call. Cite the tool results the facts came from.",
      "claim 3: It cites r99, which is not a result id from this session.",
    ]);
  });

  it("must back every number in the prose", () => {
    const report = broken((d) => {
      d.claims.splice(11, 1); // the claim about the average score and the goals
    });
    expect(codes(report)).toEqual(["number-without-claim"]);
    expect(messages(report, "number-without-claim").map((m) => /"([^"]+)"/.exec(m)![1])).toEqual(["69", "29", "10"]);
    expect(broken((d) => void d.claims.splice(11, 1), { requireClaimCoverage: false }).passed).toBe(true);
  });

  it("can't be backed by an earlier submission", () => {
    const session = createRecapSession(context);
    for (const entry of sample.evidence) session.call(entry.tool, entry.input);
    const draft = draftOf(sample);
    draft.paragraphs[3] += " The best team scored 999 points.";
    draft.claims.push({ text: "The best team scored 999 points.", evidence: ["r1"] });
    const first = session.call("submit_recap", draft);
    expect(first.result).toMatchObject({ accepted: false });
    // 999 is now in the log (as submit_recap's input), but that is not evidence.
    draft.claims.at(-1)!.evidence = [first.id];
    const report = session.check(draft);
    expect(codes(report)).toEqual(["number-not-cited", "number-not-in-evidence", "unknown-result"]);
  });
});

describe("numbers", () => {
  it("may be rounded, but not changed", () => {
    expect(broken((d) => replaceAll(d, "74.3%", "74%")).issues).toEqual([]);
    expect(broken((d) => replaceAll(d, "74.3%", "75%")).passed).toBe(false);
    expect(broken((d) => replaceAll(d, "615,807", "616k")).issues).toEqual([]);
    expect(broken((d) => replaceAll(d, "615,807", "0.6 million")).issues).toEqual([]);
    expect(broken((d) => replaceAll(d, "615,807", "700k")).passed).toBe(false);
  });

  it("must be written as the kind of number they are", () => {
    const report = broken((d) => replaceAll(d, "74.3%", "74.3"));
    expect(messages(report, "number-not-in-evidence")[0]).toContain('The evidence has "74.3%": write it the same way.');
  });

  it("include prices", () => {
    // Groß cost £5.6m in GW4 (r2 and r3).
    const good = broken((d) => {
      d.paragraphs[0] += " He cost £5.6m.";
      d.claims[1].text += " He cost £5.6m.";
    });
    expect(good.issues).toEqual([]);
    const bad = broken((d) => {
      d.paragraphs[0] += " He cost £6.5m.";
      d.claims[1].text += " He cost £6.5m.";
    });
    expect(codes(bad)).toEqual(["number-not-cited", "number-not-in-evidence"]);
  });

  it("include the gameweek and the season", () => {
    expect(broken((d) => replaceAll(d, "Gameweek 4", "Gameweek 7")).issues[0]).toMatchObject({
      code: "number-not-in-evidence",
      message: expect.stringContaining("this recap is about gameweek 4"),
    });
    // An earlier gameweek can be named.
    expect(broken((d) => void (d.paragraphs[0] += " It beat anything in Gameweek 3.")).issues).toEqual([]);
    expect(broken((d) => void (d.paragraphs[0] += " It is the 2026/27 season.")).issues).toEqual([]);
    expect(codes(broken((d) => void (d.paragraphs[0] += " It is the 2025/26 season.")))).toEqual(["season"]);
  });
});

describe("length limits", () => {
  it("are reported in words the agent can act on", () => {
    const report = broken((d) => {
      d.headline = "Groß";
      d.paragraphs = [d.paragraphs[0]];
      d.claims = d.claims.slice(0, 2);
      d.claims[0].evidence = ["r1", "r2", "r3", "r4", "r5", "r7"];
    });
    expect(messages(report, "length")).toEqual([
      "headline: The headline is 4 characters. Keep it between 10 and 90.",
      "recap: The recap has 1 paragraphs. Write between 2 and 5.",
      "recap: The paragraphs total 52 words. Write between 80 and 320.",
      "recap: There are 2 claims. Give between 3 and 24.",
      "claim 1: This claim cites 6 results. Cite at most 5: split the claim.",
    ]);
  });

  it("cap paragraphs and claims", () => {
    const report = broken((d) => {
      d.paragraphs[1] = `${d.paragraphs[1]} ${"It was a good week. ".repeat(40)}`;
      d.claims[0].text = `${d.claims[0].text} ${"It was a big win. ".repeat(15)}`;
    });
    expect(messages(report, "length").map((m) => m.split(":")[0])).toEqual(["paragraph 2", "recap", "claim 1"]);
  });

  it("can be changed", () => {
    expect(broken(() => {}, { limits: { maxWords: 100 } }).issues.map((i) => i.code)).toEqual(["length"]);
  });
});
