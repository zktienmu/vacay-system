import type { NextConfig } from "next";

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

export default nextConfig;
