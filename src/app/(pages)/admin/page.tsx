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
import type { ApiResponse, LeaveRequest } from "@/types";

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
  const [reviewedExpandedId, setReviewedExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function formatDate(date: string, fmt: string) {
    return format(new Date(date), fmt, { locale: dateFnsLocale });
  }

  function formatDays(n: number) {
    if (locale === "zh-TW") return `${n} ${t("common.day")}`;
    return `${n} day${n !== 1 ? "s" : ""}`;
  }

  function getReviewText(req: LeaveRequest) {
    if (req.status === "pending") {
      return locale === "zh-TW" ? "待審核" : "Pending review";
    }
    const reviewerName = req.reviewed_by
      ? employeeMap.get(req.reviewed_by) || (locale === "zh-TW" ? "未知" : "Unknown")
      : locale === "zh-TW" ? "系統" : "System";
    const statusText =
      req.status === "approved"
        ? locale === "zh-TW" ? "核准" : "approved"
        : req.status === "rejected"
          ? locale === "zh-TW" ? "駁回" : "rejected"
          : locale === "zh-TW" ? "取消" : "cancelled";
    const dateStr = req.reviewed_at
      ? formatDate(req.reviewed_at, "yyyy/MM/dd HH:mm")
      : "";
    if (locale === "zh-TW") {
      return `${reviewerName} 於 ${dateStr} ${statusText}`;
    }
    return `${reviewerName} ${statusText} on ${dateStr}`;
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
                          <div className="col-span-2">
                            {req.delegate_assignments?.length ? (
                              <div className="space-y-3">
                                {req.delegate_assignments.map((assignment) => (
                                  <div key={assignment.delegate_id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {employeeMap.get(assignment.delegate_id) || assignment.delegate_id}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {locale === "zh-TW" ? "負責日期：" : "Dates: "}
                                      {assignment.dates.map((d) => formatDate(d, "MM/dd")).join(", ")}
                                    </p>
                                    {assignment.handover_note && (
                                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                        {locale === "zh-TW" ? "交接說明：" : "Handover: "}
                                        {assignment.handover_note}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {(req.delegate_ids?.length
                                  ? req.delegate_ids.map((id) => employeeMap.get(id)).filter(Boolean).join(", ")
                                  : null) || t("review.noneAssigned")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Handover URL */}
                        {req.handover_url && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW" ? "交接文件" : "Handover doc"}
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
          <div className="space-y-2">
            {recentReviewed.map((req) => {
              const isExpanded = reviewedExpandedId === req.id;
              return (
                <div
                  key={req.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  {/* Desktop summary row */}
                  <button
                    onClick={() => setReviewedExpandedId(isExpanded ? null : req.id)}
                    className="hidden w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 md:flex dark:hover:bg-gray-700/50"
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
                    <div className="flex items-center gap-3">
                      <LeaveTypeIcon type={req.leave_type} showLabel />
                      <LeaveStatusBadge status={req.status} />
                      {(req.status === "approved" || req.status === "pending") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(req.id);
                          }}
                          disabled={actionLoading}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        >
                          {locale === "zh-TW" ? "取消" : "Cancel"}
                        </button>
                      )}
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

                  {/* Mobile summary row */}
                  <button
                    onClick={() => setReviewedExpandedId(isExpanded ? null : req.id)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50 md:hidden dark:hover:bg-gray-700/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {employeeMap.get(req.employee_id) || req.employee?.name || t("common.unknown")}
                        </span>
                        <LeaveStatusBadge status={req.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(req.start_date, "yyyy/MM/dd")} -{" "}
                          {formatDate(req.end_date, "yyyy/MM/dd")}
                        </span>
                      </div>
                    </div>
                    <svg
                      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${
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
                          <div className="col-span-2">
                            {req.delegate_assignments?.length ? (
                              <div className="space-y-3">
                                {req.delegate_assignments.map((assignment) => (
                                  <div key={assignment.delegate_id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {employeeMap.get(assignment.delegate_id) || assignment.delegate_id}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {locale === "zh-TW" ? "負責日期：" : "Dates: "}
                                      {assignment.dates.map((d) => formatDate(d, "MM/dd")).join(", ")}
                                    </p>
                                    {assignment.handover_note && (
                                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                        {locale === "zh-TW" ? "交接說明：" : "Handover: "}
                                        {assignment.handover_note}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {(req.delegate_ids?.length
                                  ? req.delegate_ids.map((id) => employeeMap.get(id)).filter(Boolean).join(", ")
                                  : null) || t("review.noneAssigned")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Handover URL */}
                        {req.handover_url && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW" ? "交接文件" : "Handover doc"}
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

                        {/* Review info */}
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {locale === "zh-TW" ? "審核" : "Review"}
                          </span>
                          <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                            {getReviewText(req)}
                          </span>
                        </div>

                        {/* Cancel button */}
                        {(req.status === "approved" || req.status === "pending") && (
                          <div className="mt-3 flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
                            <button
                              onClick={() => handleCancel(req.id)}
                              disabled={actionLoading}
                              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                            >
                              {locale === "zh-TW" ? "取消" : "Cancel"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
