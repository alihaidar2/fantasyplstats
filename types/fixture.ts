export interface Fixture {
  id: string;
  season_id: number;
  fixture_id: number;
  event: number;
  finished: boolean;
  kickoff_time: string;
  minutes: number;
  started: boolean;
  team_a: number;
  team_a_score: number | null;
  team_h: number;
  team_h_score: number | null;
  team_h_difficulty: number;
  team_a_difficulty: number;
  pulse_id: number;
}
