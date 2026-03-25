"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useSession } from "@/hooks/useSession";
import { useTranslation } from "@/lib/i18n/context";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useSession();
  const router = useRouter();
  const { t } = useTranslation();

  // Track user activity for idle timeout
  useEffect(() => {
    const update = () => localStorage.setItem("vaca-last-activity", String(Date.now()));
    update(); // Mark active on mount
    window.addEventListener("click", update);
    window.addEventListener("keydown", update);
    return () => {
      window.removeEventListener("click", update);
      window.removeEventListener("keydown", update);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Clear the invalid session cookie before redirecting,
      // otherwise proxy.ts sees the cookie and bounces back to dashboard
      fetch("/api/auth/logout", { method: "POST" }).finally(() => {
        window.location.href = "/login";
      });
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-accent dark:border-gray-700 dark:border-t-accent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-accent dark:border-gray-700 dark:border-t-accent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F8] dark:bg-[#0A0A0A]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
