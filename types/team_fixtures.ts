export interface TeamFixtures {
  short_name: string;
  fixtures: TeamFixture[];
}

// Types for fixtures and teams
export interface TeamFixture {
  gameweek: number;
  opponent: string;
  difficulty: number;
}
