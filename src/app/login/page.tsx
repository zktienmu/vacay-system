"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppKitAccount } from "@reown/appkit/react";
import { useSignMessage, useChainId } from "wagmi";
import { SiweMessage } from "siwe";
import { useSession } from "@/hooks/useSession";
import { useTranslation } from "@/lib/i18n/context";
import type { ApiResponse } from "@/types";

type LoginStep = "idle" | "connecting" | "signing" | "verifying" | "done";

export default function LoginPage() {
  const router = useRouter();
  const { address, isConnected } = useAppKitAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { isAuthenticated, isLoading, refetch } = useSession();
  const { t } = useTranslation();

  const [step, setStep] = useState<LoginStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasTriedSiwe, setHasTriedSiwe] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSiwe = useCallback(async () => {
    if (!address || !isConnected) return;

    setError(null);
    setStep("signing");

    try {
      // 1. Get nonce
      const nonceRes = await fetch("/api/auth/nonce");
      const nonceJson: ApiResponse<{ nonce: string }> = await nonceRes.json();
      if (!nonceJson.success || !nonceJson.data) {
        throw new Error(nonceJson.error || "Failed to get nonce");
      }

      const { nonce } = nonceJson.data;

      // 2. Construct SIWE message
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in with Ethereum to Vaca",
        uri: window.location.origin,
        version: "1",
        chainId: chainId || 1,
        nonce,
      });

      const message = siweMessage.prepareMessage();

      // 3. Sign message
      const signature = await signMessageAsync({ message });

      // 4. Verify
      setStep("verifying");
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      const verifyJson: ApiResponse = await verifyRes.json();
      if (!verifyJson.success) {
        throw new Error(verifyJson.error || "Verification failed");
      }

      setStep("done");
      await refetch();
      router.replace("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      // Don't show error for user rejections — keep hasTriedSiwe true to prevent re-trigger loop
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("user denied")) {
        setStep("idle");
      } else {
        setError(msg);
        setStep("idle");
      }
    }
  }, [address, isConnected, chainId, signMessageAsync, refetch, router]);

  // Auto-trigger SIWE when wallet connects
  useEffect(() => {
    if (isConnected && address && step === "idle" && !hasTriedSiwe && !isAuthenticated) {
      setHasTriedSiwe(true);
      handleSiwe();
    }
  }, [isConnected, address, step, hasTriedSiwe, isAuthenticated, handleSiwe]);

  const stepMessage = (() => {
    switch (step) {
      case "signing":
        return t("login.signing");
      case "verifying":
        return t("login.verifying");
      case "done":
        return t("login.done");
      default:
        return null;
    }
  })();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {/* Logo */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              {t("login.title")} {"\uD83D\uDC04"}
            </h1>
            <p className="mt-2 text-gray-500 dark:text-gray-400">{t("login.subtitle")}</p>
          </div>

          {/* Connect wallet button */}
          <div className="flex flex-col items-center gap-4">
            <appkit-connect-button label="Connect Wallet" />

            {/* Status messages */}
            {stepMessage && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-500 dark:border-blue-700 dark:border-t-blue-400" />
                {stepMessage}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="w-full rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Retry button if wallet is connected but SIWE failed */}
            {isConnected && step === "idle" && hasTriedSiwe && !error && (
              <button
                onClick={() => {
                  setHasTriedSiwe(false);
                }}
                className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                {t("login.signIn")}
              </button>
            )}

            {error && isConnected && (
              <button
                onClick={() => {
                  setError(null);
                  setHasTriedSiwe(false);
                }}
                className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                {t("login.tryAgain")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
