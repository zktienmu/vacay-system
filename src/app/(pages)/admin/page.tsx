"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import { useSession } from "@/hooks/useSession";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useQuery } from "@tanstack/react-query";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import type { ApiResponse } from "@/types";

export default function AdminReviewPage() {
  const { session } = useSession();
  const { requests, isLoading, refetch } = useLeaveRequests(true);
  const { data: employeeList = [] } = useQuery({
    queryKey: ["employeeList"],
    queryFn: async () => {
      const res = await fetch("/api/employees/list");
      const json: ApiResponse<{ id: string; name: string }[]> = await res.json();
      return json.success && json.data ? json.data : [];
    },
  });
  const { t, locale } = useTranslation();

  const employeeMap = useMemo(
    () => new Map(employeeList.map((e) => [e.id, e.name])),
    [employeeList]
  );

  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function formatDate(date: string, fmt: string) {
    return format(new Date(date), fmt, { locale: dateFnsLocale });
  }

  function formatDays(n: number) {
    if (locale === "zh-TW") return `${n} ${t("common.day")}`;
    return `${n} day${n !== 1 ? "s" : ""}`;
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

  async function handleCancel(id: string) {
    const msg = locale === "zh-TW" ? "確定要取消這筆假期申請嗎？" : "Cancel this leave request?";
    if (!window.confirm(msg)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        alert(json.error || t("admin.failedUpdate"));
        return;
      }
      refetch();
    } catch {
      alert(t("admin.failedUpdate"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAction(id: string, status: "approved" | "rejected") {
    const confirmMsg =
      status === "approved"
        ? t("admin.confirmApprove")
        : t("admin.confirmReject");

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        alert(json.error || t("admin.failedUpdate"));
        return;
      }
      setExpandedId(null);
      refetch();
    } catch {
      alert(t("admin.failedUpdate"));
    } finally {
      setActionLoading(false);
    }
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
          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const isExpanded = expandedId === req.id;
              return (
                <div
                  key={req.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {employeeMap.get(req.employee_id) || req.employee?.name || t("common.unknown")}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(req.start_date, "yyyy/MM/dd")} -{" "}
                          {formatDate(req.end_date, "yyyy/MM/dd")}
                          {" · "}
                          {formatDays(req.days)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LeaveTypeIcon type={req.leave_type} showLabel />
                      <svg
                        className={`h-5 w-5 text-gray-400 transition-transform dark:text-gray-500 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-6 py-5 dark:border-gray-700 dark:bg-gray-900/50">
                      <div className="space-y-3">
                        {/* Dates */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("review.dates")}
                          </span>
                          <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                            {formatDate(req.start_date, "yyyy/MM/dd")} -{" "}
                            {formatDate(req.end_date, "yyyy/MM/dd")}
                          </span>
                        </div>

                        {/* Working days */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("review.workingDays")}
                          </span>
                          <span className="col-span-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {formatDays(req.days)}
                          </span>
                        </div>

                        {/* Delegates */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("review.delegate")}
                          </span>
                          <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                            {(req.delegate_ids?.length
                              ? req.delegate_ids.map((id) => employeeMap.get(id)).filter(Boolean).join(", ")
                              : null) || t("review.noneAssigned")}
                          </span>
                        </div>

                        {/* Handover URL */}
                        {req.handover_url && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW" ? "交接事項" : "Handover"}
                            </span>
                            <span className="col-span-2 text-sm">
                              <a
                                href={req.handover_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {req.handover_url}
                              </a>
                            </span>
                          </div>
                        )}

                        {/* Notes */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("review.notes")}
                          </span>
                          <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                            {req.notes || t("common.noNotes")}
                          </span>
                        </div>

                        {/* Submitted */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {t("review.submitted")}
                          </span>
                          <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                            {formatDate(req.created_at, "yyyy/MM/dd HH:mm")}
                          </span>
                        </div>
                      </div>

                      {/* Approve / Reject buttons */}
                      <div className="mt-5 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                        <button
                          onClick={() => handleAction(req.id, "rejected")}
                          disabled={actionLoading}
                          className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                        >
                          {t("admin.reject")}
                        </button>
                        <button
                          onClick={() => handleAction(req.id, "approved")}
                          disabled={actionLoading}
                          className="rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                        >
                          {actionLoading ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              {t("review.processing")}
                            </span>
                          ) : (
                            t("admin.approve")
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recentReviewed.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {employeeMap.get(req.employee_id) || req.employee?.name || t("common.unknown")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(req.start_date, "yyyy/MM/dd")} -{" "}
                        {formatDate(req.end_date, "yyyy/MM/dd")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveStatusBadge status={req.status} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {(req.status === "approved" || req.status === "pending") && (
                          <button
                            onClick={() => handleCancel(req.id)}
                            disabled={actionLoading}
                            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                          >
                            {locale === "zh-TW" ? "取消" : "Cancel"}
                          </button>
                        )}
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
                      {employeeMap.get(req.employee_id) || req.employee?.name || t("common.unknown")}
                    </span>
                    <div className="flex items-center gap-2">
                      <LeaveStatusBadge status={req.status} />
                      {(req.status === "approved" || req.status === "pending") && (
                        <button
                          onClick={() => handleCancel(req.id)}
                          disabled={actionLoading}
                          className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                        >
                          {locale === "zh-TW" ? "取消" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(req.start_date, "yyyy/MM/dd")} -{" "}
                      {formatDate(req.end_date, "yyyy/MM/dd")}
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
