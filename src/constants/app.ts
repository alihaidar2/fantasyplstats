// App-wide constants
export const APP_CONFIG = {
  name: "FPL Stats",
  description: "Fantasy Premier League Analytics",
  version: "1.0.0",
} as const;

// API endpoints
export const API_ENDPOINTS = {
  fixtures: "/api/fixtures",
  players: "/api/players",
  teams: "/api/teams",
} as const;

// FPL API endpoints
export const FPL_API = {
  bootstrap: "https://fantasy.premierleague.com/api/bootstrap-static/",
  fixtures: "https://fantasy.premierleague.com/api/fixtures/",
} as const;

// Game configuration
export const GAME_CONFIG = {
  maxGameweeks: 38,
  defaultGameweekRange: 6, // Show next 6 gameweeks by default
} as const;

// Theme configuration
export const THEME_CONFIG = {
  storageKey: "fpl-theme",
  defaultTheme: "system" as const,
} as const;
