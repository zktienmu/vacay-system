"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppKitAccount } from "@reown/appkit/react";
import { useDisconnect, useSignMessage, useChainId } from "wagmi";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { useSession } from "@/hooks/useSession";
import { useTranslation } from "@/lib/i18n/context";
import type { ApiResponse } from "@/types";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const ACTIVITY_KEY = "vaca-last-activity";

type LoginStep = "idle" | "connecting" | "signing" | "verifying" | "done";

export default function LoginPage() {
  const router = useRouter();
  const { address, isConnected } = useAppKitAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const { isAuthenticated, isLoading, refetch } = useSession();
  const { t } = useTranslation();

  const [step, setStep] = useState<LoginStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasTriedSiwe, setHasTriedSiwe] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // If wallet is connected but session is invalid AND there was a previous session
  // that went idle, disconnect the stale wallet first.
  // Only disconnect when lastActivity exists but is stale — if null, it means the
  // user never had a session, so this is a fresh connect and should not be interrupted.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && isConnected && !disconnecting) {
      const lastActivity = localStorage.getItem(ACTIVITY_KEY);
      const isStale = lastActivity && Date.now() - Number(lastActivity) > IDLE_TIMEOUT_MS;
      if (isStale) {
        setDisconnecting(true);
        disconnectAsync().catch(() => {}).finally(() => setDisconnecting(false));
      }
    }
  }, [isLoading, isAuthenticated, isConnected, disconnecting, disconnectAsync]);

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

      // 2. Construct SIWE message (checksum address for EIP-55 compliance)
      const checksumAddress = getAddress(address);
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: checksumAddress,
        statement: "Sign in with Ethereum to Dinngo Leave System",
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
      if (
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("user denied") ||
        msg.toLowerCase().includes("connector not connected")
      ) {
        setStep("idle");
      } else {
        setError(msg);
        setStep("idle");
      }
    }
  }, [address, isConnected, chainId, signMessageAsync, refetch, router]);

  // Reset hasTriedSiwe when wallet disconnects so auto-trigger works on reconnect
  // (Brave's built-in wallet auto-reconnects on page load, which can race with
  // the idle disconnect and leave hasTriedSiwe=true after a failed attempt)
  useEffect(() => {
    if (!isConnected) {
      setHasTriedSiwe(false);
    }
  }, [isConnected]);

  // Auto-trigger SIWE when wallet connects
  useEffect(() => {
    if (isConnected && address && step === "idle" && !hasTriedSiwe && !isAuthenticated && !disconnecting) {
      setHasTriedSiwe(true);
      handleSiwe();
    }
  }, [isConnected, address, step, hasTriedSiwe, isAuthenticated, disconnecting, handleSiwe]);

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
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0A0A0A]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-accent dark:border-gray-700 dark:border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        <div className="border border-gray-200 bg-white p-8 shadow-lg dark:border-[#27272A] dark:bg-[#18181B]">
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
              <div className="flex items-center gap-2 text-sm text-accent">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-200 border-t-accent dark:border-orange-800 dark:border-t-accent" />
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
                className="bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
                className="bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
