// Cloudflare Web Analytics: cookieless, so the site needs no cookie banner.
//
// The token is a public site tag (it ends up in every page's HTML), not a
// credential. It comes from the CF_ANALYTICS_TOKEN secret, which the deploy
// workflow passes to production builds only, so local builds and PR previews
// ship without the beacon.
//
// This renders a plain <script> rather than next/script: the static export
// writes it straight into each page's HTML, as Cloudflare documents it, with no
// client component. next/script's afterInteractive strategy would only inject
// the tag from client JS after hydration. Cloudflare's FAQ now asks manual
// embeds to use type="module" (module scripts are deferred by default).

export const CF_BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/** The beacon's <script> props, or null when there is no token. */
export function cloudflareBeaconProps(token: string | undefined) {
  const trimmed = token?.trim();
  if (!trimmed) return null;
  return {
    type: "module",
    src: CF_BEACON_SRC,
    "data-cf-beacon": JSON.stringify({ token: trimmed }),
  };
}

export default function Analytics() {
  // Read at build time: the static export renders this during `next build`.
  // Keep the literal `process.env.NEXT_PUBLIC_…` form so Next.js can inline it.
  const props = cloudflareBeaconProps(process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN);
  return props ? <script {...props} /> : null;
}
