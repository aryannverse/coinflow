import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 only serves the listed qualities (default [75]); 70 is used by the landing screenshot.
  images: { qualities: [70, 75] },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
