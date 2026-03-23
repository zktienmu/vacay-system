"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { AppKitProvider } from "@reown/appkit/react";
import { wagmiAdapter, networks } from "@/lib/wagmi";
import { I18nProvider } from "@/lib/i18n/context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!;

const metadata = {
  name: "Dinngo 請假系統",
  description: "Dinngo 請假管理系統",
  url: typeof window !== "undefined" ? window.location.origin : "https://leave.dinngo.co",
  icons: [],
};

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider
          projectId={projectId}
          metadata={metadata}
          networks={networks}
          adapters={[wagmiAdapter]}
        >
          <I18nProvider>
            {children}
          </I18nProvider>
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
