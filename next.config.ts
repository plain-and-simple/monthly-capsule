import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosting lock: https://capsule.plainandsimple.app
  // Separate Vercel project. Do not set basePath, assetPrefix, or rewrites
  // that mount this app under /capsule on the marketing domain.
  // Path + rewrite was considered and rejected.
  // Default Server Action body is 1 MB. Submit posts up to 6 compressed photos
  // (1 MB each) plus letter + form overhead. 16mb stays above that budget.
  // Do not lower below product caps × max photos + overhead.
  // Exceeding it throws Next.js E394 (digest …@E394) before submitLetter runs.
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
