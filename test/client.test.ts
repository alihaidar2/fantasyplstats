import { describe, expect, it, vi } from "vitest";
import {
  FplRequestError,
  FplValidationError,
  createFplClient,
  createLimiter,
} from "../src/lib/fpl";
import { loadRaw } from "./helpers";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function clientWith(responses: Array<() => Response | Promise<Response>>) {
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = createFplClient({
    baseUrl: "https://fpl.test/api/",
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep,
    retries: 2,
    backoffMs: 100,
  });
  return { client, fetch, sleep };
}

describe("createFplClient", () => {
  it("validates responses against the schema", async () => {
    const { client, fetch } = clientWith([() => json(loadRaw("element-summary-1.json"))]);
    const summary = await client.getElementSummary(1);
    expect(summary.history.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledWith("https://fpl.test/api/element-summary/1/", expect.anything());
  });

  it("retries 5xx responses with backoff, honouring Retry-After", async () => {
    const { client, fetch, sleep } = clientWith([
      () => json({}, 503),
      () => json({}, 429, { "retry-after": "5" }),
      () => json(loadRaw("fixtures.json")),
    ]);
    await expect(client.getFixtures()).resolves.toHaveLength(60);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(5000);
  });

  it("gives up after the retry budget", async () => {
    const { client, fetch } = clientWith([() => json({}, 502), () => json({}, 502), () => json({}, 502)]);
    await expect(client.getFixtures()).rejects.toBeInstanceOf(FplRequestError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 404", async () => {
    const { client, fetch } = clientWith([() => json({ detail: "Not found." }, 404)]);
    await expect(client.getElementSummary(99999)).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries the HTML page FPL serves while the game is updating", async () => {
    const { client } = clientWith([
      () => new Response("<html>The game is being updated.</html>", { status: 200 }),
      () => json(loadRaw("fixtures.json")),
    ]);
    await expect(client.getFixtures()).resolves.toHaveLength(60);
  });

  it("fails validation without retrying", async () => {
    const { client, fetch } = clientWith([() => json({ elements: [] })]);
    await expect(client.getBootstrap()).rejects.toBeInstanceOf(FplValidationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid player ids without a request", async () => {
    const { client, fetch } = clientWith([]);
    await expect(client.getElementSummary(0)).rejects.toThrow("Invalid player id");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("createLimiter", () => {
  it("never runs more than the limit at once", async () => {
    const limit = createLimiter(5);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
      });
    await Promise.all(Array.from({ length: 40 }, task));
    expect(peak).toBe(5);
  });

  it("keeps going after a task fails", async () => {
    const limit = createLimiter(1);
    const failed = limit(async () => {
      throw new Error("boom");
    });
    await expect(failed).rejects.toThrow("boom");
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });
});
