// Shared pieces for the Open Graph images in src/app (opengraph-image.tsx).
// They are rendered at build time by next/og and written to out/ as PNGs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { SITE_URL } from "@/lib/site";

/** Tailwind emerald values, so the images match the site. */
export const OG_COLORS = {
  emerald950: "#022c22",
  emerald900: "#064e3b",
  emerald700: "#047857",
  emerald300: "#6ee7b7",
  emerald200: "#a7f3d0",
  emerald50: "#ecfdf5",
  white: "#ffffff",
} as const;

type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

let fonts: Promise<OgFont[]> | undefined;

/**
 * Geist from the `geist` package, read from disk once per build worker.
 * Never load fonts over the network here: the build must work offline.
 */
export function ogFonts(): Promise<OgFont[]> {
  fonts ??= (async () => {
    const dir = path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");
    const [regular, bold] = await Promise.all([
      readFile(path.join(dir, "Geist-Regular.ttf")),
      readFile(path.join(dir, "Geist-Bold.ttf")),
    ]);
    return [
      { name: "Geist", data: regular, weight: 400, style: "normal" },
      { name: "Geist", data: bold, weight: 700, style: "normal" },
    ];
  })();
  return fonts;
}

const domain = new URL(SITE_URL).host;

/** The branded 1200×630 frame: header badge, content, footer tags and the domain. */
export function OgFrame({ children, tags = [] }: { children: ReactNode; tags?: string[] }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        fontFamily: "Geist",
        color: OG_COLORS.white,
        backgroundColor: OG_COLORS.emerald900,
        backgroundImage: `linear-gradient(135deg, ${OG_COLORS.emerald950} 0%, ${OG_COLORS.emerald900} 55%, ${OG_COLORS.emerald700} 100%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 700,
            padding: "8px 22px",
            borderRadius: 12,
            backgroundColor: OG_COLORS.emerald50,
            color: OG_COLORS.emerald700,
          }}
        >
          FPL Stats
        </div>
        <div style={{ display: "flex", fontSize: 28, color: OG_COLORS.emerald200 }}>
          Fantasy Premier League Analytics
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          {tags.map((tag) => (
            <OgPill key={tag} style={{ marginRight: 14 }}>
              {tag}
            </OgPill>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: OG_COLORS.emerald300 }}>
          {domain}
        </div>
      </div>
    </div>
  );
}

/** A rounded label; translucent white on the dark background by default. */
export function OgPill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 26,
        padding: "8px 20px",
        borderRadius: 999,
        backgroundColor: "rgba(255, 255, 255, 0.12)",
        color: OG_COLORS.emerald50,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
