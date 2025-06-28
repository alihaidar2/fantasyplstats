import { FPL_API } from "@/constants/app";
import { BootstrapData, Fixture } from "@/types/fixtures";

class FPLApiService {
  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    timeout = 30000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`Fetching from: ${url}`);

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

      console.log(`Response status: ${response.status} for ${url}`);

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

      const data = await response.json();
      console.log(
        `Successfully fetched data from ${url}, size: ${
          JSON.stringify(data).length
        } chars`
      );
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Fetch error for ${url}:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        name: error instanceof Error ? error.name : "Unknown",
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async getBootstrapData(): Promise<BootstrapData> {
    try {
      return await this.fetchWithTimeout<BootstrapData>(FPL_API.bootstrap);
    } catch (error) {
      console.error("Failed to fetch bootstrap data:", error);
      throw new Error(
        `Failed to fetch FPL bootstrap data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getFixtures(): Promise<Fixture[]> {
    try {
      return await this.fetchWithTimeout<Fixture[]>(FPL_API.fixtures);
    } catch (error) {
      console.error("Failed to fetch fixtures:", error);
      throw new Error(
        `Failed to fetch FPL fixtures: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getAllData(): Promise<{
    bootstrap: BootstrapData;
    fixtures: Fixture[];
  }> {
    try {
      console.log("Starting parallel fetch of bootstrap and fixtures data...");

      const [bootstrap, fixtures] = await Promise.all([
        this.getBootstrapData(),
        this.getFixtures(),
      ]);

      console.log(
        `Successfully fetched all data: ${bootstrap.teams.length} teams, ${fixtures.length} fixtures`
      );
      return { bootstrap, fixtures };
    } catch (error) {
      console.error("Failed to fetch all FPL data:", error);
      throw new Error(
        `Failed to fetch FPL data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

export const fplApiService = new FPLApiService();
