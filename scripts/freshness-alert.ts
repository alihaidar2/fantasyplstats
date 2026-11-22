// Decides how the freshness workflow alerts through a GitHub issue: open one
// when the check fails, comment while it keeps failing, and comment and close
// it once the check passes. Kept apart from check-freshness.ts (which makes
// the GitHub API calls) so tests can import it without side effects.
//
// An issue, rather than GitHub's failed-run email, is the alert because those
// emails go to whoever last changed or re-enabled the workflow, and the daily
// keep-alive re-enables it.

import type { FreshnessResult } from "./freshness";

export const STALE_ISSUE_TITLE = "Site data is stale";

export interface IssueSummary {
  number: number;
  title: string;
  /** Set when the "issue" is a pull request (the issues API lists both). */
  pull_request?: unknown;
}

export type AlertAction =
  | { kind: "none" }
  | { kind: "open"; title: string; body: string }
  | { kind: "comment"; issue: number; body: string }
  | { kind: "close"; issue: number; body: string };

/** The open alert issue among a list of open issues, if any (the oldest if several). */
export function findAlertIssue(openIssues: readonly IssueSummary[]): number | null {
  const matches = openIssues
    .filter((i) => !i.pull_request && i.title.trim() === STALE_ISSUE_TITLE)
    .map((i) => i.number);
  return matches.length ? Math.min(...matches) : null;
}

export function decideAlert(
  result: FreshnessResult,
  openIssue: number | null,
  runUrl: string,
): AlertAction {
  if (result.ok) {
    if (openIssue === null) return { kind: "none" };
    return {
      kind: "close",
      issue: openIssue,
      body: `Recovered: ${result.message}\n\nRun: ${runUrl}`,
    };
  }

  const body = `The freshness check failed:\n\n> ${result.message}\n\nRun: ${runUrl}`;
  if (openIssue === null) {
    return {
      kind: "open",
      title: STALE_ISSUE_TITLE,
      body:
        `${body}\n\n` +
        "The check comments here on each failing run and closes this issue when the site's data is fresh again.",
    };
  }
  return { kind: "comment", issue: openIssue, body };
}
