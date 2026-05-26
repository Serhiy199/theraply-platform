import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Certificate uploads pass through a Server Action. Keep this below Vercel's 4.5MB payload limit.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
