import { ImageResponse } from "next/og";
import { OG_COLORS, OgFrame, ogFonts } from "@/lib/og";
import { SITE_DESCRIPTION, SITE_OG_IMAGE } from "@/lib/site";

// The site-wide share image, rendered at build time. Every page inherits it
// through the og:image and twitter:image tags. `output: "export"` requires
// image routes to be marked static explicitly.
export const dynamic = "force-static";
export const alt = SITE_OG_IMAGE.alt;
export const size = { width: SITE_OG_IMAGE.width, height: SITE_OG_IMAGE.height };
export const contentType = SITE_OG_IMAGE.type;

// Without this, the static export writes the image to out/opengraph-image with
// no extension, and Azure Static Web Apps picks Content-Type from the
// extension. The id becomes the last URL segment, so the file is written to
// out/opengraph-image/og.png, which is SITE_OG_IMAGE.url.
export function generateImageMetadata() {
  return [{ id: "og.png", alt, size, contentType }];
}

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame tags={["Fixture difficulty", "Player stats", "Form"]}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          Master Your Fantasy League
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            maxWidth: 960,
            fontSize: 34,
            lineHeight: 1.35,
            color: OG_COLORS.emerald200,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
