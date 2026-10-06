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
  // heic-convert loads libheif-js/wasm-bundle (a 2 MB JS+wasm file). Vercel
  // sharp has no HEVC HEIF decoder, so that wasm must ship with the function.
  // serverExternalPackages keeps the decoder out of the webpack graph; tracing
  // includes put the files on the lambda disk. Missing either path returns
  // "Could not compress that photo" for iPhone HEIC on production.
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode", "libheif-js", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/libheif-js/**/*",
      "./node_modules/heic-decode/**/*",
      "./node_modules/heic-convert/**/*",
      "./src/lib/pdf-fonts/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
