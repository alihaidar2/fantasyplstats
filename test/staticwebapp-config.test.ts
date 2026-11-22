import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// public/ is copied to the root of out/, which is where Azure Static Web Apps
// reads staticwebapp.config.json from.
interface Route {
  route: string;
  headers?: Record<string, string>;
}
interface SwaConfig {
  routes: Route[];
  responseOverrides?: Record<string, { rewrite?: string; statusCode?: number }>;
  navigationFallback?: unknown;
  trailingSlash?: string;
  globalHeaders?: Record<string, string>;
}

const config = JSON.parse(
  readFileSync(path.join(__dirname, "..", "public", "staticwebapp.config.json"), "utf8"),
) as SwaConfig;

const cacheControl = (route: string) =>
  config.routes.find((r) => r.route === route)?.headers?.["Cache-Control"];

/** The first route that matches a path, as Azure picks it (first match wins). */
function matchRoute(urlPath: string): Route | undefined {
  return config.routes.find(({ route }) => {
    if (!route.includes("*")) return route === urlPath;
    const prefix = route.slice(0, route.indexOf("*"));
    const ext = route.slice(route.indexOf("*") + 1);
    if (!urlPath.startsWith(prefix)) return false;
    if (ext === "") return true;
    const exts = ext.replace(/^\.\{?|\}$/g, "").split(",");
    return exts.some((e) => urlPath.endsWith(`.${e}`));
  });
}

describe("staticwebapp.config.json", () => {
  it("serves the Next.js 404 page with a 404 status", () => {
    expect(config.responseOverrides?.["404"]).toEqual({ rewrite: "/404.html", statusCode: 404 });
  });

  it("has no SPA fallback, which would turn missing pages into 200s", () => {
    expect(config.navigationFallback).toBeUndefined();
  });

  it("only uses wildcards that Azure accepts: one, at the end of the route", () => {
    for (const { route } of config.routes) {
      expect(route.startsWith("/"), route).toBe(true);
      const stars = route.split("*").length - 1;
      expect(stars, route).toBeLessThanOrEqual(1);
      if (stars === 1) {
        // "/dir/*", "/dir/*.ext" or "/dir/*.{a,b}"
        expect(route, route).toMatch(/\/\*(\.(\w+|\{\w+(,\w+)*\}))?$/);
      }
    }
  });

  it("caches content-hashed assets for a year and pages briefly", () => {
    expect(matchRoute("/_next/static/chunks/abc123.js")?.headers?.["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    for (const page of ["/", "/players/1/", "/players/1/index.txt", "/404.html"]) {
      expect(matchRoute(page)?.headers?.["Cache-Control"], page).toMatch(/max-age=0/);
    }
  });

  it("never lets the freshness monitor read a cached health.json", () => {
    expect(matchRoute("/health.json")?.route).toBe("/health.json");
    expect(cacheControl("/health.json")).toBe("no-cache");
  });

  it("sends basic security headers", () => {
    expect(config.globalHeaders).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    // No CSP yet: Next.js hydrates with inline scripts, so one needs care.
    expect(config.globalHeaders?.["Content-Security-Policy"]).toBeUndefined();
  });
});
