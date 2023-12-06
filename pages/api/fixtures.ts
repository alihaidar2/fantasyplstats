import type { NextApiRequest, NextApiResponse } from 'next';
import { Fixture } from '../../types/Fixture';
import { Team } from '../../types/Team';
// const db = require('db.js'); // Adjust the path as necessary


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // const teamsArray = await db.query('SELECT * FROM teams')
    // const fixturesArray = await db.query('SELECT * FROM fixtures WHERE finished = false')

    const teamsArray = {}
    const fixturesArray = {}

    // Transform rows to match the Fixture type
    const fixtures: Fixture[] = fixturesArray[0].map((fixture: any) => {
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
    const teams: Team[] = teamsArray[0].map((team: any) => {
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
    res.status(200).json({teams: teams, fixtures: fixtures});
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch data' });
  }
}