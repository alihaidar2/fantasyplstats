import type { NextApiRequest, NextApiResponse } from "next";
import { Fixture } from "../../types/Fixture";
import { Team } from "../../types/Team";

const { client } = require("./db/db-client");

// constants
const difficultyMapping = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
const TOTAL_GAMEWEEKS = 38;
let currentGameweek;
let remainingGameweeks;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Fetch the current or upcoming gameweek
    const currentGameweekResult = await client.query(
      "SELECT * FROM gameweeks WHERE finished = false ORDER BY deadline_time LIMIT 1"
    );
    currentGameweek = currentGameweekResult.rows[0].id;
    remainingGameweeks = TOTAL_GAMEWEEKS - currentGameweek;

    // Fetch all teams
    const teamsResult = await client.query("SELECT * FROM teams");
    const teamsArray = teamsResult.rows;

    // Fetch fixtures for remaining gameweeks
    const fixturesResult = await client.query(
      "SELECT * FROM fixtures WHERE event >= $1",
      [currentGameweek]
    );
    const fixturesArray = fixturesResult.rows;

    // console.log("teamsArray: ", teamsArray);
    // console.log("fixturesArray: ", fixturesArray);

    // Build Dictionary : shortName - fixtures(+diff)
    const heatmapSimple = calculateHeatmapData(
      teamsArray,
      fixturesArray,
      "simple"
    );
    const heatmapAttack = calculateHeatmapData(
      teamsArray,
      fixturesArray,
      "attack"
    );
    const heatmapDefense = calculateHeatmapData(
      teamsArray,
      fixturesArray,
      "defense"
    );
    const heatmapOverall = calculateHeatmapData(
      teamsArray,
      fixturesArray,
      "overall"
    );

    // Transform rows to match the Fixture type
    const fixtures: Fixture[] = fixturesArray.map((fixture: any) => {
      return {
        fixture_id: fixture.fixture_id,
        season_id: fixture.season_id,
        event: fixture.event,
        finished: fixture.finished,
        kickoff_time: fixture.kickoff_time,
        team_a: fixture.team_a,
        team_a_score: fixture.team_a_score,
        team_h: fixture.team_h,
        team_h_score: fixture.team_h_score,
        team_h_difficulty: fixture.team_h_difficulty,
        team_a_difficulty: fixture.team_a_difficulty,
        pulse_id: fixture.pulse_id,
      };
    });

    // Transform rows to match the Fixture type
    const teams: Team[] = teamsArray.map((team: any) => {
      return {
        team_id: team.team_id,
        season_id: team.season_id,
        team_name: team.team_name,
        code: team.code,
        draw: team.draw,
        form: team.form,
        loss: team.loss,
        played: team.played,
        points: team.points,
        position: team.position,
        short_name: team.short_name,
        strength: team.strength,
        team_division: team.team_division,
        unavailable: team.unavailable,
        win: team.win,
        strength_overall_home: team.strength_overall_home,
        strength_overall_away: team.strength_overall_away,
        strength_attack_home: team.strength_attack_home,
        strength_attack_away: team.strength_attack_away,
        strength_defence_home: team.strength_defence_home,
        strength_defence_away: team.strength_defence_away,
        pulse_id: team.pulse_id,
      };
    });

    // Process the data for the heatmap
    res.status(200).json({
      teams: teams,
      fixtures: fixtures,
      heatmapSimple: heatmapSimple,
      heatmapAttack: heatmapAttack,
      heatmapDefense: heatmapDefense,
      heatmapOverall: heatmapOverall,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not fetch data" });
  }
}

function calculateHeatmapData(teams: any, fixtures: any, type: string) {
  const teamsOpponentsAndDifficulties: { [teamName: string]: SimpleFixture[] } =
    {};

  const remainingGameweeks = TOTAL_GAMEWEEKS - currentGameweek;

  // Initialize each team with placeholders for each game week
  teams.forEach((team) => {
    teamsOpponentsAndDifficulties[team.short_name] = Array.from(
      { length: remainingGameweeks },
      () => ({
        opponentName: "BGW",
        difficulty: 0,
      })
    );
  });

  // Process each actual fixture
  fixtures.forEach((fixture: Fixture) => {
    const fixtureGameweek = fixture.event;

    if (fixtureGameweek === -1) {
      // Skip processing this fixture if it's not in the selected range
      return;
    }

    const homeTeam = teams.find((t) => t.team_id === fixture.team_h);
    const awayTeam = teams.find((t) => t.team_id === fixture.team_a);

    if (homeTeam && awayTeam) {
      let difficultyForHome = 0;
      let difficultyForAway = 0;

      // Calculate difficulties based on selected heatmap
      if (type == "simple") {
        difficultyForHome = fixture.team_h_difficulty;
        difficultyForHome =
          (difficultyMapping[difficultyForHome] || difficultyForHome) * 20;

        difficultyForAway = fixture.team_a_difficulty;
        difficultyForAway =
          (difficultyMapping[difficultyForAway] || difficultyForAway) * 20;
      } else if (type == "attack") {
        difficultyForHome = calculateDifficulty(
          homeTeam.strength_attack_home,
          awayTeam.strength_defence_away
        );
        difficultyForAway = calculateDifficulty(
          awayTeam.strength_attack_away,
          homeTeam.strength_defence_home
        );
      } else if (type == "defense") {
        difficultyForHome = calculateDifficulty(
          homeTeam.strength_defence_home,
          awayTeam.strength_attack_away
        );
        difficultyForAway = calculateDifficulty(
          awayTeam.strength_defence_away,
          homeTeam.strength_attack_home
        );
      } else if (type == "overall") {
        difficultyForHome = calculateDifficulty(
          homeTeam.strength_overall_home,
          awayTeam.strength_overall_away
        );
        difficultyForAway = calculateDifficulty(
          awayTeam.strength_overall_away,
          homeTeam.strength_overall_home
        );
      }
      // Calculate dictionary index
      let index = fixtureGameweek - (TOTAL_GAMEWEEKS - remainingGameweeks);

      // Update the fixture for the home and away teams for the specific game week
      teamsOpponentsAndDifficulties[homeTeam.short_name][index] = {
        opponentName: awayTeam.short_name,
        difficulty: difficultyForHome,
      };
      teamsOpponentsAndDifficulties[awayTeam.short_name][index] = {
        opponentName: homeTeam.short_name,
        difficulty: difficultyForAway,
      };
    }
  });

  const test = Object.values(teamsOpponentsAndDifficulties).map(
    (teamFixtures) => teamFixtures
  );

  return teamsOpponentsAndDifficulties;
}

interface SimpleFixture {
  opponentName: string;
  difficulty: number;
}

// Gets difficulty between 0-100
const calculateDifficulty = (attack, defense) => {
  // Constants
  const MIN_RATIO = 0.76; // Minimum expected ratio
  const MAX_RATIO = 1.32; // Maximum expected ratio (adjust based on your data)

  // Ensure defense is not zero to prevent division by zero
  defense = defense === 0 ? 1 : defense;

  // Calculate the ratio
  let ratio = attack / defense;

  // Linear scaling of the ratio to the 0-100 range
  let scaledScore = ((ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO)) * 100;

  // Clamping the score between 0 and 100
  scaledScore = Math.max(0, Math.min(scaledScore, 100));

  return scaledScore;
};
