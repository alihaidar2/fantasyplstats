import { gameweekSummary } from "./gameweek-summary";
import { playerStory } from "./player-story";
import { submitRecap } from "./submit-recap";
import type { RecapTool } from "./tool";

/** Every tool the recap agent can call, in the order they are offered. */
export const RECAP_TOOLS: readonly RecapTool[] = [gameweekSummary, playerStory, submitRecap];

export { gameweekSummary, playerStory, submitRecap };
export * from "./tool";
