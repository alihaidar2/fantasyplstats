import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The FPL data layer is shared with build scripts and a future Azure
    // Function, so it must not depend on Next.js, React or the `@/` alias.
    files: ["src/lib/fpl/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@next/*", "react", "react/*", "react-dom", "react-dom/*", "server-only"],
              message: "src/lib/fpl must stay framework-free.",
            },
            {
              group: ["@/*"],
              message: "Use relative imports in src/lib/fpl so it works without the Next.js path alias.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", ".data/**", "next-env.d.ts"]),
]);

export default eslintConfig;
