// types/Team.ts

export interface Team {
    team_id: number;
    season_id: number;
    team_name: string;
    code: number;
    draw: number;
    form: string;
    loss: number;
    played: number;
    points: number;
    position: number;
    short_name: string;
    strength: number;
    team_division: string;
    unavailable: boolean;
    win: number;
    strength_overall_home: number;
    strength_overall_away: number;
    strength_attack_home: number;
    strength_attack_away: number;
    strength_defence_home: number;
    strength_defence_away: number;
    pulse_id: number;
  }
  