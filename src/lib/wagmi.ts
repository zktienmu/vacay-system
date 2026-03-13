"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!;

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
