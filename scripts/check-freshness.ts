// Fails (exit 1) if the live site's data is older than the limit, so the
// scheduled freshness workflow fails and GitHub emails a notification.
// Run: npx tsx scripts/check-freshness.ts
//
// Env: HEALTH_URL (default https://fantasyplstats.com/health.json),
// MAX_AGE_HOURS (default 6), GITHUB_STEP_SUMMARY (receives the result).

import { appendFileSync } from "node:fs";
import {
  DEFAULT_HEALTH_URL,
  checkFreshness,
  parseMaxAgeHours,
  type FreshnessResult,
} from "./freshness";

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

async function main() {
  const url = process.env.HEALTH_URL || DEFAULT_HEALTH_URL;
  const result = await run(url);

  if (result.ok) console.log(result.message);
  else console.error(`::error title=Site freshness::${result.message}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Site freshness\n\n${result.ok ? "✅" : "❌"} ${result.message}\n\nChecked ${url}\n`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
