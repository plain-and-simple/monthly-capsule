import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosting lock: https://capsule.plainandsimple.app
  // Separate Vercel project. Do not set basePath, assetPrefix, or rewrites
  // that mount this app under /capsule on the marketing domain.
  // Path + rewrite was considered and rejected.
  // Default Server Action body is 1 MB. Submit allows 6 × 2 MB photos.
  // Exceeding it throws Next.js E394 (digest …@E394) before submitLetter runs.
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
