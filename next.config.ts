import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Publish the whole site as static files in out/, built from the FPL
  // snapshot that `npm run fetch` writes to .data/.
  output: "export",
  // Emit players/1/index.html rather than players/1.html: Azure Static Web
  // Apps serves both /players/1 and /players/1/ from a folder's index.html.
  trailingSlash: true,
  // There is no image optimization server in a static export.
  images: { unoptimized: true },
};

export default nextConfig;
