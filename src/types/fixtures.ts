import type { Player } from "./players";

export type Cell = { text: string; blank: boolean; difficulty?: number };

export interface MatrixRow {
  team: string;
  [k: `gw${number}`]: Cell;
}

export interface Fixture {
  event: number;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
}

export interface Team {
  id: number;
  short_name: string;
  name: string;
}

export interface ElementType {
  id: number;
  singular_name: string;
  plural_name: string;
}

export interface BootstrapData {
  teams: Team[];
  element_types: ElementType[];
  elements: Player[]; // Player data from the bootstrap API
}
