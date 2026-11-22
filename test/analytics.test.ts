import { isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Analytics, { CF_BEACON_SRC, cloudflareBeaconProps } from "../src/components/layout/analytics";

const ENV = "NEXT_PUBLIC_CF_ANALYTICS_TOKEN";

describe("cloudflareBeaconProps", () => {
  it("returns null without a token", () => {
    expect(cloudflareBeaconProps(undefined)).toBeNull();
    expect(cloudflareBeaconProps("")).toBeNull();
    expect(cloudflareBeaconProps("  \n\t ")).toBeNull();
  });

  it("builds Cloudflare's documented snippet from a trimmed token", () => {
    const props = cloudflareBeaconProps("  abc123def456 \n");
    expect(props).toEqual({
      type: "module",
      src: "https://static.cloudflareinsights.com/beacon.min.js",
      "data-cf-beacon": '{"token":"abc123def456"}',
    });
    expect(JSON.parse(props!["data-cf-beacon"])).toEqual({ token: "abc123def456" });
  });
});

describe("Analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders nothing when the token is unset, empty or whitespace", () => {
    vi.stubEnv(ENV, undefined);
    expect(Analytics()).toBeNull();
    vi.stubEnv(ENV, "");
    expect(Analytics()).toBeNull();
    vi.stubEnv(ENV, "   ");
    expect(Analytics()).toBeNull();
  });

  it("renders the beacon module script when the token is set", () => {
    vi.stubEnv(ENV, " tok-en ");
    const el = Analytics() as ReactElement<Record<string, unknown>>;
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe("script");
    expect(el.props.src).toBe(CF_BEACON_SRC);
    expect(el.props.type).toBe("module");
    expect(JSON.parse(el.props["data-cf-beacon"] as string)).toEqual({ token: "tok-en" });
  });
});
