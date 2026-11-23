import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The FPL data layer, the recap tools and the page calculations are shared
    // with build scripts, the recap workflow, the tests and a future Azure
    // Function, so they must not depend on Next.js, React or the `@/` alias.
    files: ["src/lib/fpl/**", "src/lib/recap/**", "src/lib/stats/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@next/*", "react", "react/*", "react-dom", "react-dom/*", "server-only"],
              message: "src/lib/fpl, src/lib/recap and src/lib/stats must stay framework-free.",
            },
            {
              group: ["@/*"],
              message: "Use relative imports in src/lib/fpl, src/lib/recap and src/lib/stats so they work without the Next.js path alias.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", ".data/**", "next-env.d.ts"]),
]);

export default eslintConfig;
