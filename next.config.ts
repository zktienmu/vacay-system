import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {},
  // These are transitive deps from @reown/appkit-adapter-wagmi -> wagmi ->
  // @base-org/account -> @coinbase/cdp-sdk -> @solana/*. They must be
  // external to avoid SSR bundling issues with native/WASM modules.
  serverExternalPackages: [
    "@coinbase/cdp-sdk",
    "@solana-program/token",
    "@solana-program/system",
    "@solana/kit",
    "@base-org/account",
    "jspdf",
    "fflate",
  ],
};

export default withSentryConfig(nextConfig, {
  // Upload source maps for better stack traces
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Suppress noisy Sentry CLI logs during build
  silent: !process.env.CI,

  // Disable Sentry telemetry
  telemetry: false,
});
