import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: [
    "@coinbase/cdp-sdk",
    "@solana-program/token",
    "@solana-program/system",
    "@solana/kit",
    "@base-org/account",
  ],
};

export default nextConfig;
