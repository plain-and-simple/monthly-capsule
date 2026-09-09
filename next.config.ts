import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosting lock: https://capsule.plainandsimple.app
  // Separate Vercel project. Do not set basePath, assetPrefix, or rewrites
  // that mount this app under /capsule on the marketing domain.
  // Path + rewrite was considered and rejected.
};

export default nextConfig;
