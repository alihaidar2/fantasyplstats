// Fails (exit 1) if the live site's data is older than the limit. In GitHub
// Actions it also alerts through a "Site data is stale" issue: it opens one
// (or comments on the open one) when the check fails, and comments and closes
// it when the check passes again. See freshness-alert.ts for why.
// Run: npx tsx scripts/check-freshness.ts
//
// Env: HEALTH_URL (default https://fantasyplstats.com/health.json),
// MAX_AGE_HOURS (default 6), GITHUB_STEP_SUMMARY (receives the result).
// Issue alerts run only when GITHUB_TOKEN and GITHUB_REPOSITORY are set (the
// workflow sets them); GITHUB_API_URL, GITHUB_SERVER_URL and GITHUB_RUN_ID
// come from Actions.

import { appendFileSync } from "node:fs";
import {
  DEFAULT_HEALTH_URL,
  checkFreshness,
  parseMaxAgeHours,
  type FreshnessResult,
} from "./freshness";
import { decideAlert, findAlertIssue, type AlertAction, type IssueSummary } from "./freshness-alert";

const TIMEOUT_MS = 15_000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 5_000;

async function fetchHealth(url: string): Promise<unknown> {
  // A unique query string and no-store keep a CDN or proxy from answering
  // with an old copy.
  const target = new URL(url);
  target.searchParams.set("t", Date.now().toString());
  const res = await fetch(target, {
    cache: "no-store",
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`response is not JSON: ${text.slice(0, 120)}`);
  }
}

async function run(url: string): Promise<FreshnessResult> {
  let maxAgeHours: number;
  try {
    maxAgeHours = parseMaxAgeHours(process.env.MAX_AGE_HOURS);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }

  // One retry, so a single network blip doesn't send a failure email.
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const body = await fetchHealth(url);
      return checkFreshness(body, new Date(), maxAgeHours);
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  // Node's fetch reports network errors as "fetch failed" with the detail in `cause`.
  const cause = lastError instanceof Error && lastError.cause instanceof Error ? ` (${lastError.cause.message})` : "";
  const reason = lastError instanceof Error ? lastError.message + cause : String(lastError);
  return { ok: false, message: `Could not fetch ${url}: ${reason}` };
}

/** A minimal GitHub REST client for the issue calls the alert needs. */
function githubIssues(repo: string, token: string) {
  const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${api}/repos/${repo}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "fantasyplstats-freshness-check",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`GitHub ${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  return {
    async listOpen(): Promise<IssueSummary[]> {
      const all: IssueSummary[] = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await call<IssueSummary[]>("GET", `/issues?state=open&per_page=100&page=${page}`);
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all;
    },
    open: (title: string, body: string) => call<{ html_url: string }>("POST", "/issues", { title, body }),
    comment: (issue: number, body: string) =>
      call<{ html_url: string }>("POST", `/issues/${issue}/comments`, { body }),
    close: (issue: number) =>
      call<{ html_url: string }>("PATCH", `/issues/${issue}`, { state: "closed", state_reason: "completed" }),
  };
}

async function applyAlert(result: FreshnessResult): Promise<AlertAction | null> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!token || !repo) return null;

  const server = process.env.GITHUB_SERVER_URL || "https://github.com";
  const runUrl = `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;
  const github = githubIssues(repo, token);
  const action = decideAlert(result, findAlertIssue(await github.listOpen()), runUrl);

  switch (action.kind) {
    case "none":
      break;
    case "open":
      console.log(`Opened ${(await github.open(action.title, action.body)).html_url}`);
      break;
    case "comment":
      console.log(`Commented on ${(await github.comment(action.issue, action.body)).html_url}`);
      break;
    case "close":
      await github.comment(action.issue, action.body);
      console.log(`Closed ${(await github.close(action.issue)).html_url}`);
      break;
  }
  return action;
}

async function main() {
  const url = process.env.HEALTH_URL || DEFAULT_HEALTH_URL;
  const result = await run(url);

  if (result.ok) console.log(result.message);
  else console.error(`::error title=Site freshness::${result.message}`);

  // A failed alert fails the run too, so it shows in the Actions tab.
  let alertFailed = false;
  let alertNote = "";
  try {
    const action = await applyAlert(result);
    if (action && action.kind !== "none") alertNote = `\n\nAlert issue: ${action.kind}`;
  } catch (err) {
    alertFailed = true;
    alertNote = `\n\nCould not update the alert issue: ${(err as Error).message}`;
    console.error(`::error title=Freshness alert::${(err as Error).message}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Site freshness\n\n${result.ok ? "✅" : "❌"} ${result.message}\n\nChecked ${url}${alertNote}\n`,
    );
  }
  process.exit(result.ok && !alertFailed ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
