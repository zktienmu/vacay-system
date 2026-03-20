"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import { useSession } from "@/hooks/useSession";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";

export default function AdminReviewPage() {
  const { session } = useSession();
  const { requests, isLoading } = useLeaveRequests(true);
  const { t, locale } = useTranslation();

  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  function formatDate(date: string, fmt: string) {
    return format(new Date(date), fmt, { locale: dateFnsLocale });
  }

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );

  const recentReviewed = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        .slice(0, 10),
    [requests]
  );

  if (session?.role !== "admin" && !session?.is_manager) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("common.accessDenied")}</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {t("common.accessDeniedDesc")}
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t("common.goToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  function formatDays(n: number) {
    if (locale === "zh-TW") return `${n} ${t("common.day")}`;
    return `${n} day${n !== 1 ? "s" : ""}`;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("admin.reviewTitle")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t("admin.reviewDesc")}
        </p>
      </div>

      {/* Pending requests */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("admin.pendingRequests")} ({pendingRequests.length})
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {t("admin.noPending")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                    <th className="px-6 py-3">{t("admin.employee")}</th>
                    <th className="px-6 py-3">{t("admin.type")}</th>
                    <th className="px-6 py-3">{t("admin.dates")}</th>
                    <th className="px-6 py-3">{t("admin.daysCol")}</th>
                    <th className="px-6 py-3">{t("admin.notesCol")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="group cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <Link href={`/admin/review/${req.id}`} className="block">
                          {req.employee?.name || t("common.unknown")}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Link href={`/admin/review/${req.id}`} className="block">
                          <LeaveTypeIcon type={req.leave_type} showLabel />
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <Link href={`/admin/review/${req.id}`} className="block">
                          {formatDate(req.start_date, "MMM d")} -{" "}
                          {formatDate(req.end_date, "MMM d, yyyy")}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <Link href={`/admin/review/${req.id}`} className="block">
                          {req.days}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <Link href={`/admin/review/${req.id}`} className="block">
                          {req.notes || "-"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-700">
              {pendingRequests.map((req) => (
                <Link
                  key={req.id}
                  href={`/admin/review/${req.id}`}
                  className="block p-4 transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {req.employee?.name || t("common.unknown")}
                    </span>
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                  </div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(req.start_date, "MMM d")} -{" "}
                    {formatDate(req.end_date, "MMM d, yyyy")} ({formatDays(req.days)})
                  </div>
                  {req.notes && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-1 dark:text-gray-400">
                      {req.notes}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recently reviewed */}
      {recentReviewed.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("admin.recentlyReviewed")}
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                    <th className="px-6 py-3">{t("admin.employee")}</th>
                    <th className="px-6 py-3">{t("admin.type")}</th>
                    <th className="px-6 py-3">{t("admin.dates")}</th>
                    <th className="px-6 py-3">{t("admin.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recentReviewed.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {req.employee?.name || t("common.unknown")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(req.start_date, "MMM d")} -{" "}
                        {formatDate(req.end_date, "MMM d, yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveStatusBadge status={req.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-700">
              {recentReviewed.map((req) => (
                <div key={req.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {req.employee?.name || t("common.unknown")}
                    </span>
                    <LeaveStatusBadge status={req.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(req.start_date, "MMM d")} -{" "}
                      {formatDate(req.end_date, "MMM d")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
