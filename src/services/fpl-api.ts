import { FPL_API } from "@/constants/app";
import { BootstrapData, Fixture } from "@/types/fixtures";

class FPLApiService {
  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    timeout = 10000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async getBootstrapData(): Promise<BootstrapData> {
    try {
      return await this.fetchWithTimeout<BootstrapData>(FPL_API.bootstrap);
    } catch (error) {
      console.error("Failed to fetch bootstrap data:", error);
      throw new Error("Failed to fetch FPL bootstrap data");
    }
  }

  async getFixtures(): Promise<Fixture[]> {
    try {
      return await this.fetchWithTimeout<Fixture[]>(FPL_API.fixtures);
    } catch (error) {
      console.error("Failed to fetch fixtures:", error);
      throw new Error("Failed to fetch FPL fixtures");
    }
  }

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
      console.error("Failed to fetch all FPL data:", error);
      throw new Error("Failed to fetch FPL data");
    }
  }
}

export const fplApiService = new FPLApiService();
