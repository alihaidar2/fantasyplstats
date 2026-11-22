// App-wide constants
export const APP_CONFIG = {
  name: "FPL Stats",
  description: "Fantasy Premier League Analytics",
  version: "1.0.0",
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
