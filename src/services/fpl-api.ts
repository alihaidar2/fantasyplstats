import { FPL_API } from "@/constants/app";
import { BootstrapData, Fixture } from "@/types/fixtures";
import { PlayerElementSummary } from "@/types/players";

class FPLApiService {
  // Helper to handle and log errors consistently
  private handleError(context: string, error: unknown): never {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`${context}:`, error);
    throw new Error(`${context}: ${message}`);
  }

  // Fetch with timeout and consistent headers
  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    timeout = 30000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FantasyPLStats/1.0)",
          Accept: "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error for ${url}:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          headers: Object.fromEntries(response.headers.entries()),
        });
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      this.handleError(`Fetch error for ${url}`, error);
    }
  }

  // Fetch bootstrap data
  async getBootstrapData(): Promise<BootstrapData> {
    try {
      return await this.fetchWithTimeout<BootstrapData>(FPL_API.bootstrap);
    } catch (error) {
      this.handleError("Failed to fetch bootstrap data", error);
    }
  }

  // Fetch all fixtures
  async getFixtures(): Promise<Fixture[]> {
    try {
      return await this.fetchWithTimeout<Fixture[]>(FPL_API.fixtures);
    } catch (error) {
      this.handleError("Failed to fetch fixtures", error);
    }
  }

  // Fetch both bootstrap and fixtures in parallel
  async getAllData(): Promise<{
    bootstrap: BootstrapData;
    fixtures: Fixture[];
  }> {
    try {
      const [bootstrap, fixtures] = await Promise.all([
        this.getBootstrapData(),
        this.getFixtures(),
      ]);
      return { bootstrap, fixtures };
    } catch (error) {
      this.handleError("Failed to fetch all FPL data", error);
    }
  }

  // Fetch player element summary
  async getElementSummary(playerId: number): Promise<PlayerElementSummary> {
    try {
      console.log("playerId", playerId);
      return await this.fetchWithTimeout<PlayerElementSummary>(
        `https://fantasy.premierleague.com/api/element-summary/${playerId}/`
      );
    } catch (error) {
      this.handleError(
        `Failed to fetch element-summary for player ${playerId}`,
        error
      );
    }
  }
}

export const fplApiService = new FPLApiService();
