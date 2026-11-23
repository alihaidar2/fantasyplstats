// The AI gameweek recap's plain-code half: one gameweek's verified data, the
// tools an agent investigates it with, the evidence log of what they
// returned, and the checker that verifies a recap against that log.
//
// Like src/lib/fpl, this folder has no Next.js, React or `@/` imports (ESLint
// enforces it), so the scheduled workflow and a future Azure Function can use
// it. It makes no AI calls.

export * from "./context";
export * from "./recap";
export * from "./names";
export * from "./numbers";
export * from "./checker";
export * from "./session";
export * from "./tools";
