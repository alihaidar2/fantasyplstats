// Loads the gameweeks recorded in test/fixtures/gameweeks/ (see its README)
// as the sources a GameweekContext is built from. The eval harness and the
// recap tests replay them; nothing here calls FPL.

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  dreamTeamSchema,
  elementSchema,
  elementTypeSchema,
  eventLiveSchema,
  eventSchema,
  gameweekFixturesSchema,
  historyEntrySchema,
  teamSchema,
} from "../src/lib/fpl";
import { buildGameweekContext, type GameweekContext, type GameweekSources } from "../src/lib/recap/context";

export const RECORDED_GAMEWEEKS_DIR = path.join(__dirname, "..", "test", "fixtures", "gameweeks");

const bootstrapSchema = z.object({
  events: z.array(eventSchema),
  teams: z.array(teamSchema),
  element_types: z.array(elementTypeSchema),
  elements: z.array(
    elementSchema.pick({ id: true, first_name: true, second_name: true, web_name: true, team: true, element_type: true }),
  ),
});

const folder = (gameweek: number) => `gw${String(gameweek).padStart(2, "0")}`;

export interface Recording {
  /** The recorded gameweeks, ascending. */
  gameweeks: number[];
  /**
   * The sources for one gameweek, cut off as if recorded straight after it:
   * later gameweeks' results, history rows and event figures are left out.
   */
  sources(gameweek: number): GameweekSources;
  context(gameweek: number): GameweekContext;
}

export function loadRecording(dir: string = RECORDED_GAMEWEEKS_DIR): Recording {
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
  const gameweeks = z.object({ gameweeks: z.array(z.number().int()) }).parse(read("manifest.json")).gameweeks;
  const bootstrap = bootstrapSchema.parse(read("bootstrap-static.json"));
  const histories = z.record(z.string(), z.array(historyEntrySchema)).parse(read("element-history.json"));
  const fixturesOf = new Map(
    gameweeks.map((gw) => [gw, gameweekFixturesSchema.parse(read(`${folder(gw)}/fixtures.json`))]),
  );

  const sources = (gameweek: number): GameweekSources => {
    if (!fixturesOf.has(gameweek)) {
      throw new Error(`Gameweek ${gameweek} is not recorded. Recorded: ${gameweeks.join(", ")}.`);
    }
    return {
      snapshot: {
        bootstrap: {
          ...bootstrap,
          events: bootstrap.events.map((e) =>
            e.id <= gameweek
              ? e
              : {
                  ...e,
                  finished: false,
                  data_checked: false,
                  average_entry_score: 0,
                  highest_score: null,
                  most_captained: null,
                  most_transferred_in: null,
                  top_element_info: null,
                  chip_plays: [],
                  ranked_count: 0,
                },
          ),
        },
        fixtures: gameweeks.filter((gw) => gw <= gameweek).flatMap((gw) => fixturesOf.get(gw)!),
        summaries: Object.fromEntries(
          Object.entries(histories).map(([id, history]) => [id, { history: history.filter((h) => h.round <= gameweek) }]),
        ),
      },
      live: eventLiveSchema.parse(read(`${folder(gameweek)}/live.json`)),
      fixtures: structuredClone(fixturesOf.get(gameweek)!),
      dreamTeam: dreamTeamSchema.parse(read(`${folder(gameweek)}/dream-team.json`)),
      eventStatus: null,
    };
  };

  return { gameweeks, sources, context: (gameweek) => buildGameweekContext(gameweek, sources(gameweek)) };
}
