export interface Player {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  total_points: number;
  points_per_game: string;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  form: string;
  selected_by_percent: string;
  now_cost: number;
  cost_change_start: number;
  cost_change_event: number;
  value_form: string;
  value_season: string;
  status: string;
  news: string;
  news_added?: string;
  chance_of_playing_next_round?: number;
  chance_of_playing_this_round?: number;
  transfers_in: number;
  transfers_out: number;
  transfers_in_event: number;
  transfers_out_event: number;
  minutes: number;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  photo: string;
  team_code: number;
}

export interface BootstrapData {
  teams: { id: number; short_name: string; name: string }[];
  element_types: { id: number; singular_name: string; plural_name: string }[];
  elements: Player[];
}
