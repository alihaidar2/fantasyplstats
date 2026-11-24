// The AI gameweek recap: one gameweek's verified data, the tools an agent
// investigates it with, the evidence log of what they returned, the checker
// that verifies a recap against that log, and the agent that writes one.
//
// Like src/lib/fpl, this folder has no Next.js, React or `@/` imports (ESLint
// enforces it), so the scheduled workflow and a future Azure Function can use
// it. Nothing exported here calls a model by itself: the agent and the judge
// take a model as a parameter, and the one real model (the Claude API, in
// anthropic-model.ts) is imported from its own file, so the site never
// bundles the SDK.

export * from "./context";
export * from "./recap";
export * from "./cards";
export * from "./text";
export * from "./names";
export * from "./numbers";
export * from "./checker";
export * from "./session";
export * from "./tools";
export * from "./model";
export * from "./pricing";
export * from "./prompt";
export * from "./template";
export * from "./agent";
export * from "./judge";
export * from "./fakes";
