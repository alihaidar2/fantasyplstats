// Throttled, validating client for the unofficial FPL API.
// Server-side only: the FPL API must never be called from the browser.

import type { z } from "zod";
import {
  dreamTeamSchema,
  eventLiveSchema,
  eventStatusSchema,
  gameweekFixturesSchema,
  type DreamTeam,
  type EventLive,
  type EventStatus,
  type GameweekFixture,
} from "./gameweek";
import {
  bootstrapSchema,
  elementSummarySchema,
  fixturesSchema,
  type Bootstrap,
  type ElementSummary,
  type Fixture,
} from "./schemas";

export const DEFAULT_FPL_BASE_URL = "https://fantasy.premierleague.com/api";

export interface FplClientOptions {
  baseUrl?: string;
  /** Maximum requests in flight at once. Keep this at about 5. */
  concurrency?: number;
  timeoutMs?: number;
  /** Retries after the first attempt, for network errors, timeouts, 429 and 5xx. */
  retries?: number;
  /** Delay before the first retry; doubles on each retry, with jitter. */
  backoffMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

export interface FplClient {
  getBootstrap(): Promise<Bootstrap>;
  getFixtures(): Promise<Fixture[]>;
  getElementSummary(id: number): Promise<ElementSummary>;
}

/** The per-gameweek endpoints the recap reads (see docs/fpl-api.md). */
export interface FplGameweekClient {
  /** Every player's stats and points breakdown for one gameweek. */
  getEventLive(gameweek: number): Promise<EventLive>;
  /** Whether the current gameweek's points and bonus are final. Says nothing about past gameweeks. */
  getEventStatus(): Promise<EventStatus>;
  /** The gameweek's top-scoring XI. FPL answers 404 until the gameweek has been played. */
  getDreamTeam(gameweek: number): Promise<DreamTeam>;
  /** One gameweek's fixtures, with scores and per-player stats. */
  getGameweekFixtures(gameweek: number): Promise<GameweekFixture[]>;
}

export class FplRequestError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "FplRequestError";
  }
}

export class FplValidationError extends Error {
  constructor(
    readonly url: string,
    readonly issues: string,
  ) {
    super(`FPL response from ${url} failed validation:\n${issues}`);
    this.name = "FplValidationError";
  }
}

/** Runs at most `limit` tasks at once. */
export function createLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`concurrency must be a positive integer, got ${limit}`);
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= limit) return;
    const start = queue.shift();
    if (start) start();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function checkGameweek(gameweek: number): void {
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error(`Invalid gameweek: ${gameweek}`);
  }
}

export function createFplClient(options: FplClientOptions = {}): FplClient & FplGameweekClient {
  const {
    baseUrl = DEFAULT_FPL_BASE_URL,
    concurrency = 5,
    timeoutMs = 20_000,
    retries = 3,
    backoffMs = 1_000,
    fetch: fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    userAgent = "Mozilla/5.0 (compatible; FantasyPLStats/1.0)",
  } = options;
  const limit = createLimiter(concurrency);
  const root = baseUrl.replace(/\/+$/, "");

  async function attempt(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new FplRequestError(`Request to ${url} failed: ${reason}`, url, undefined, true);
    }

    if (!response.ok) {
      // Drain the body so the connection can be reused.
      await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      throw new FplRequestError(
        `Request to ${url} returned HTTP ${response.status}`,
        url,
        response.status,
        retryable,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    try {
      return await response.json();
    } catch {
      // FPL serves an HTML or plain-text page while the game is updating.
      throw new FplRequestError(`Response from ${url} is not JSON`, url, response.status, true);
    }
  }

  async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const url = `${root}/${path}`;
    const body = await limit(async () => {
      for (let tries = 0; ; tries++) {
        try {
          return await attempt(url);
        } catch (error) {
          const retryable = error instanceof FplRequestError && error.retryable;
          if (!retryable || tries >= retries) throw error;
          const backoff = backoffMs * 2 ** tries * (0.75 + Math.random() * 0.5);
          await sleep(Math.max(backoff, error.retryAfterMs ?? 0));
        }
      }
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new FplValidationError(url, formatIssues(parsed.error));
    return parsed.data;
  }

  return {
    getBootstrap: () => getJson("bootstrap-static/", bootstrapSchema),
    getFixtures: () => getJson("fixtures/", fixturesSchema),
    getElementSummary: (id) => {
      if (!Number.isInteger(id) || id < 1) {
        return Promise.reject(new Error(`Invalid player id: ${id}`));
      }
      return getJson(`element-summary/${id}/`, elementSummarySchema);
    },
    getEventLive: async (gameweek) => {
      checkGameweek(gameweek);
      return getJson(`event/${gameweek}/live/`, eventLiveSchema);
    },
    getEventStatus: () => getJson("event-status/", eventStatusSchema),
    getDreamTeam: async (gameweek) => {
      checkGameweek(gameweek);
      return getJson(`dream-team/${gameweek}/`, dreamTeamSchema);
    },
    getGameweekFixtures: async (gameweek) => {
      checkGameweek(gameweek);
      return getJson(`fixtures/?event=${gameweek}`, gameweekFixturesSchema);
    },
  };
}
