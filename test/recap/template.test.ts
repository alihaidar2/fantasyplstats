import { describe, expect, it } from "vitest";
import { RECAP_LIMITS } from "../../src/lib/recap/recap";
import { recapToText } from "../../src/lib/recap/text";
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
    expect(report.numbersChecked).toBeGreaterThan(10);
    expect(draft.cards.length).toBeGreaterThanOrEqual(RECAP_LIMITS.minCards);
    expect(draft.cards.length).toBeLessThanOrEqual(RECAP_LIMITS.maxCards);
    expect(draft.headline.length).toBeLessThanOrEqual(RECAP_LIMITS.headlineMaxChars);
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
    expect(recapToText(draft)).not.toMatch(/transferred/);
    expect(recapToText(template(recording.context(2)).draft)).toMatch(/most-transferred-in player/);
  });

  it("reads like this (GW5)", () => {
    const { draft } = template(recording.context(5));
    expect(draft.headline).toBe("Brobbey tops Gameweek 5 with 17 points");
    expect(recapToText(draft)).toBe(
      [
        "# Brobbey tops Gameweek 5 with 17 points",
        "",
        "In numbers: 48 average score · 27 goals · 10 matches.",
        "",
        "The captaincy: Haaland scored 6 points.",
        "",
        "The top scorer: Brobbey 17 points.",
        "",
        "Close behind: Semenyo 17 points. Dasilva 15 points. Schuster 14 points.",
        "",
        "The most goals: Man City 5-3 Sunderland; Spurs 2-3 Aston Villa; Brentford 3-0 Chelsea.",
        "",
        "Also worth knowing: Gibbs-White was the most-transferred-in player (2 points). The highest manager score of the gameweek was 126 points.",
      ].join("\n"),
    );
    // Every card cites the one result it was copied from.
    expect(draft.cards.every((c) => c.evidence.length === 1 && /^r[12]$/.test(c.evidence[0]))).toBe(true);
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
    expect(new Set(draft.cards.flatMap((c) => c.evidence))).toEqual(new Set(["r1", "r4"]));
    expect(session.check(draft).passed).toBe(true);
  });
});
