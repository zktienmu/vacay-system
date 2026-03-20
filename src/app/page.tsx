"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { useTranslation } from "@/lib/i18n/context";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSession();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</p>
      </div>
    </div>
  );
}
