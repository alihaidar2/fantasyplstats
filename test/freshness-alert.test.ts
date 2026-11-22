import { describe, expect, it } from "vitest";
import { STALE_ISSUE_TITLE, decideAlert, findAlertIssue } from "../scripts/freshness-alert";

const runUrl = "https://github.com/owner/repo/actions/runs/123";
const fresh = { ok: true, message: "Site data is fresh: generated 2026-11-22T10:00:00Z (2.0 h ago, limit 6 h)" };
const stale = { ok: false, message: "Site data is stale: generated 2026-11-22T02:00:00Z (10.0 h ago, limit 6 h)" };

describe("decideAlert", () => {
  it("does nothing when the check passes and no issue is open", () => {
    expect(decideAlert(fresh, null, runUrl)).toEqual({ kind: "none" });
  });

  it("opens an issue with the message and run link when the check fails", () => {
    const action = decideAlert(stale, null, runUrl);
    expect(action).toMatchObject({ kind: "open", title: STALE_ISSUE_TITLE });
    if (action.kind !== "open") throw new Error("expected open");
    expect(action.body).toContain(stale.message);
    expect(action.body).toContain(runUrl);
  });

  it("comments on the open issue instead of opening another while the check keeps failing", () => {
    const action = decideAlert(stale, 7, runUrl);
    expect(action).toMatchObject({ kind: "comment", issue: 7 });
    if (action.kind !== "comment") throw new Error("expected comment");
    expect(action.body).toContain(stale.message);
    expect(action.body).toContain(runUrl);
  });

  it("comments that it recovered and closes the open issue when the check passes", () => {
    const action = decideAlert(fresh, 7, runUrl);
    expect(action).toMatchObject({ kind: "close", issue: 7 });
    if (action.kind !== "close") throw new Error("expected close");
    expect(action.body).toMatch(/^Recovered/);
    expect(action.body).toContain(fresh.message);
    expect(action.body).toContain(runUrl);
  });
});

describe("findAlertIssue", () => {
  it("finds the open issue with the alert title", () => {
    expect(
      findAlertIssue([
        { number: 3, title: "Something else" },
        { number: 5, title: STALE_ISSUE_TITLE },
      ]),
    ).toBe(5);
  });

  it("returns null when there is none", () => {
    expect(findAlertIssue([])).toBeNull();
    expect(findAlertIssue([{ number: 3, title: "Site data is stale?" }])).toBeNull();
  });

  it("ignores pull requests with the same title", () => {
    expect(findAlertIssue([{ number: 4, title: STALE_ISSUE_TITLE, pull_request: {} }])).toBeNull();
  });

  it("picks the oldest if several are open", () => {
    expect(
      findAlertIssue([
        { number: 9, title: STALE_ISSUE_TITLE },
        { number: 6, title: STALE_ISSUE_TITLE },
      ]),
    ).toBe(6);
  });
});
