import { describe, expect, it } from "vitest";
import { RECAP_LIMITS } from "../../src/lib/recap/recap";
import { createRecapSession } from "../../src/lib/recap/session";
import { TEMPLATE_CALLS, buildTemplateRecap } from "../../src/lib/recap/template";
import { loadRecording } from "../../scripts/recorded-gameweeks";
import { loadContext, makeBlank, makeDouble } from "./helpers";

// The fallback template is the agent's last resort, so it has to pass the
// checker for any gameweek: every recorded one, and the awkward shapes.

const recording = loadRecording();

function template(context: ReturnType<typeof loadContext>) {
  const session = createRecapSession(context);
  for (const call of TEMPLATE_CALLS) session.call(call.tool, call.input);
  const draft = buildTemplateRecap(session.evidence)!;
  return { draft, report: session.check(draft) };
}

describe("the fallback template", () => {
  it.each(recording.gameweeks)("passes the checker for recorded GW%i", (gameweek) => {
    const { draft, report } = template(recording.context(gameweek));
    expect(report.issues).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.numbersChecked).toBeGreaterThan(20);
    expect(draft.paragraphs).toHaveLength(3);
    expect(draft.headline.length).toBeLessThanOrEqual(RECAP_LIMITS.headlineMaxChars);
    for (const claim of draft.claims) expect(claim.text.length).toBeLessThanOrEqual(RECAP_LIMITS.claimMaxChars);
  });

  it.each([3, 4] as const)("passes for GW%i of the recap fixtures (a full snapshot)", (gameweek) => {
    expect(template(loadContext(gameweek)).report).toMatchObject({ passed: true, issues: [] });
  });

  it("passes in a double gameweek and a blank one", () => {
    const double = template(loadContext(4, (s) => void makeDouble(s, s.fixtures[0].id)));
    expect(double.report).toMatchObject({ passed: true, issues: [] });
    const blank = template(loadContext(4, (s) => makeBlank(s, s.fixtures[0].id)));
    expect(blank.report).toMatchObject({ passed: true, issues: [] });
  });

  it("says nothing about transfers in gameweek 1", () => {
    const { draft, report } = template(recording.context(1));
    expect(report.passed).toBe(true);
    expect(draft.paragraphs.join(" ")).not.toMatch(/transferred/);
    expect(template(recording.context(2)).draft.paragraphs.join(" ")).toMatch(/most-transferred-in player/);
  });

  it("reads like this (GW5)", () => {
    const { draft } = template(recording.context(5));
    expect(draft.headline).toBe("Brobbey tops Gameweek 5 with 17 points");
    expect(draft.paragraphs[0]).toMatch(/^Brobbey of Sunderland was the top scorer of Gameweek 5 with 17 points\. /);
    expect(draft.paragraphs[1]).toMatch(/^The average manager scored 48 points\. The highest manager score of the gameweek was 126 points\. Haaland was the most-captained player and returned 6 points\. Gibbs-White was the most-transferred-in player and returned 2 points\.$/);
    expect(draft.paragraphs[2]).toMatch(/Man City 5-3 Sunderland/);
    // Every sentence is a claim citing the one result it was copied from.
    expect(draft.claims.map((c) => c.text).join(" ")).toBe(draft.paragraphs.join(" "));
    expect(draft.claims.every((c) => c.evidence.length === 1 && /^r[12]$/.test(c.evidence[0]))).toBe(true);
  });

  it("uses the latest results in the log, and needs both", () => {
    const session = createRecapSession(recording.context(5));
    session.call("gameweek_summary", {});
    expect(buildTemplateRecap(session.evidence)).toBeNull();
    session.call("top_performers", { limit: 0 }); // fails
    expect(buildTemplateRecap(session.evidence)).toBeNull();
    session.call("top_performers", { limit: 2 });
    session.call("top_performers", { limit: 5 });
    const draft = buildTemplateRecap(session.evidence)!;
    expect(new Set(draft.claims.flatMap((c) => c.evidence))).toEqual(new Set(["r1", "r4"]));
    expect(session.check(draft).passed).toBe(true);
  });
});
