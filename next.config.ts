import type { NextConfig } from "next";

interface CustomExperimentalConfig {
  appDir?: boolean;
}

interface CustomNextConfig extends Omit<NextConfig, "experimental"> {
  experimental?: CustomExperimentalConfig;
}

const nextConfig: CustomNextConfig = {
  experimental: {
    appDir: true,
  },
};

export default nextConfig;
