import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The FPL data layer and the recap tools are shared with build scripts,
    // the recap workflow and a future Azure Function, so they must not depend
    // on Next.js, React or the `@/` alias.
    files: ["src/lib/fpl/**", "src/lib/recap/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@next/*", "react", "react/*", "react-dom", "react-dom/*", "server-only"],
              message: "src/lib/fpl and src/lib/recap must stay framework-free.",
            },
            {
              group: ["@/*"],
              message: "Use relative imports in src/lib/fpl and src/lib/recap so they work without the Next.js path alias.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", ".data/**", "next-env.d.ts"]),
]);

export default eslintConfig;
