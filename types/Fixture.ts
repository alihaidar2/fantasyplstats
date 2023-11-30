// types/Fixture.ts

export interface Fixture {
    fixture_id: number;
    season_id: number;
    event: number;
    finished: boolean;
    kickoff_time: Date;
    team_a: number;
    team_a_score: number;
    team_h: number;
    team_h_score: number;
    team_h_difficulty: number;
    team_a_difficulty: number;
    pulse_id: string;
  }
  