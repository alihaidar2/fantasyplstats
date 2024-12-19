export interface Team {
  id: string;
  season_id: number;
  team_id: number;
  team_name: string;
  short_name: string;
  points: number;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
  draw: number;
  loss: number;
  win: number;
  team_division: string | null;
  unavailable: boolean;
  pulse_id: number;
}
