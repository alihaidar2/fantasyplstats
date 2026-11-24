import { captaincy } from "./captaincy";
import { defensiveContributions } from "./defensive-contributions";
import { disciplineAndAvailability } from "./discipline-and-availability";
import { expectedVsActual } from "./expected-vs-actual";
import { findPlayers } from "./find-players";
import { gameweekSummary } from "./gameweek-summary";
import { ownershipOutcomes } from "./ownership-outcomes";
import { playerStory } from "./player-story";
import { priceChanges } from "./price-changes";
import { seasonRecords } from "./season-records";
import { storyCandidates } from "./story-candidates";
import { submitRecap } from "./submit-recap";
import { teamStory } from "./team-story";
import type { RecapTool } from "./tool";
import { topPerformers } from "./top-performers";
import { transferStory } from "./transfer-story";

/** Every tool the recap agent can call, in the order they are offered. */
export const RECAP_TOOLS: readonly RecapTool[] = [
  gameweekSummary,
  storyCandidates,
  captaincy,
  transferStory,
  topPerformers,
  playerStory,
  findPlayers,
  ownershipOutcomes,
  expectedVsActual,
  defensiveContributions,
  teamStory,
  disciplineAndAvailability,
  priceChanges,
  seasonRecords,
  submitRecap,
];

export {
  captaincy,
  defensiveContributions,
  disciplineAndAvailability,
  expectedVsActual,
  findPlayers,
  gameweekSummary,
  ownershipOutcomes,
  playerStory,
  priceChanges,
  seasonRecords,
  storyCandidates,
  submitRecap,
  teamStory,
  topPerformers,
  transferStory,
};
export * from "./tool";
