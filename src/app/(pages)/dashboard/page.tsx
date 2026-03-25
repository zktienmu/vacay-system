"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import { useSession } from "@/hooks/useSession";
import { useLeaveBalance } from "@/hooks/useLeaveBalance";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useQuery } from "@tanstack/react-query";
import BalanceCard from "@/components/BalanceCard";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import type { LeaveRequest, ApiResponse } from "@/types";

interface DelegatedLeave extends LeaveRequest {
  employee: { id: string; name: string } | null;
}

export default function DashboardPage() {
  const { session } = useSession();
  const { balances, isLoading: balancesLoading } = useLeaveBalance();
  const { requests, isLoading: requestsLoading, refetch } = useLeaveRequests();
  const { t, locale } = useTranslation();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: employeeList = [] } = useQuery({
    queryKey: ["employeeList"],
    queryFn: async () => {
      const res = await fetch("/api/employees/list");
      const json: ApiResponse<{ id: string; name: string }[]> = await res.json();
      return json.success && json.data ? json.data : [];
    },
  });
  const employeeMap = useMemo(
    () => new Map(employeeList.map((e) => [e.id, e.name])),
    [employeeList]
  );

  const handleCancel = useCallback(async (id: string) => {
    const msg = locale === "zh-TW" ? "確定要取消這筆假期申請嗎？" : "Cancel this leave request?";
    if (!window.confirm(msg)) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        alert(json.error || "Failed to cancel");
        return;
      }
      refetch();
    } catch {
      alert(locale === "zh-TW" ? "取消失敗" : "Failed to cancel");
    } finally {
      setCancellingId(null);
    }
  }, [locale, refetch]);
  const [delegatedLeaves, setDelegatedLeaves] = useState<DelegatedLeave[]>([]);
  const [delegatedLoading, setDelegatedLoading] = useState(true);
  const [delegatedExpandedId, setDelegatedExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDelegated() {
      try {
        const res = await fetch("/api/leave/delegated");
        const json: ApiResponse<DelegatedLeave[]> = await res.json();
        if (json.success && json.data) {
          setDelegatedLeaves(json.data);
        }
      } catch {
        // ignore
      } finally {
        setDelegatedLoading(false);
      }
    }

    fetchDelegated();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const upcomingApproved = requests.filter(
    (r) => r.status === "approved" && new Date(r.start_date) > today,
  );
  const pastApproved = requests.filter(
    (r) => r.status === "approved" && new Date(r.start_date) <= today,
  );
  const otherRequests = requests.filter(
    (r) => r.status === "rejected" || r.status === "cancelled",
  );

  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  function formatDate(date: string, fmt: string) {
    return format(new Date(date), fmt, { locale: dateFnsLocale });
  }

  function formatDays(n: number) {
    if (locale === "zh-TW") return `${n} ${t("common.day")}`;
    return `${n} day${n !== 1 ? "s" : ""}`;
  }

  function canCancel(req: LeaveRequest) {
    if (req.status !== "pending" && req.status !== "approved") return false;
    // Approved + already started → cannot cancel
    if (req.status === "approved") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(req.start_date) <= today) return false;
    }
    return true;
  }

  function getReviewText(req: LeaveRequest) {
    if (req.status === "pending") {
      return locale === "zh-TW" ? "待審核" : "Pending review";
    }
    if (!req.reviewed_by || !req.reviewed_at) {
      return locale === "zh-TW" ? "無審核紀錄" : "No review record";
    }
    const dateStr = formatDate(req.reviewed_at, "yyyy/MM/dd HH:mm");
    if (req.status === "cancelled") {
      const isSelf = req.reviewed_by === req.employee_id;
      if (locale === "zh-TW") {
        return isSelf ? `本人於 ${dateStr} 取消` : `${employeeMap.get(req.reviewed_by) || "未知"} 於 ${dateStr} 取消`;
      }
      return isSelf ? `Self-cancelled on ${dateStr}` : `${employeeMap.get(req.reviewed_by) || "Unknown"} cancelled on ${dateStr}`;
    }
    const reviewerName = employeeMap.get(req.reviewed_by) || (locale === "zh-TW" ? "未知" : "Unknown");
    const statusText = req.status === "approved"
      ? (locale === "zh-TW" ? "核准" : "approved")
      : (locale === "zh-TW" ? "駁回" : "rejected");
    if (locale === "zh-TW") {
      return `${reviewerName} 於 ${dateStr} ${statusText}`;
    }
    return `${reviewerName} ${statusText} on ${dateStr}`;
  }

  function renderRequestCards(items: typeof requests) {
    return (
      <div className="space-y-2">
        {items.map((req) => {
          const isExpanded = expandedId === req.id;
          return (
            <div key={req.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <button onClick={() => setExpandedId(isExpanded ? null : req.id)} className="hidden w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 md:flex dark:hover:bg-gray-700/50">
                <div className="flex items-center gap-6">
                  <LeaveTypeIcon type={req.leave_type} showLabel />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(req.start_date, "yyyy/MM/dd")} - {formatDate(req.end_date, "yyyy/MM/dd")}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{formatDays(req.days)}</span>
                  <LeaveStatusBadge status={req.status} />
                </div>
                <div className="flex items-center gap-3">
                  {canCancel(req) && (
                    <button onClick={(e) => { e.stopPropagation(); handleCancel(req.id); }} disabled={cancellingId === req.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50">
                      {cancellingId === req.id ? (locale === "zh-TW" ? "取消中..." : "Cancelling...") : (locale === "zh-TW" ? "取消" : "Cancel")}
                    </button>
                  )}
                  <svg className={`h-5 w-5 text-gray-400 transition-transform dark:text-gray-500 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>
              <button onClick={() => setExpandedId(isExpanded ? null : req.id)} className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50 md:hidden dark:hover:bg-gray-700/50">
                <div>
                  <div className="flex items-center gap-2">
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                    <LeaveStatusBadge status={req.status} />
                  </div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{formatDate(req.start_date, "yyyy/MM/dd")} - {formatDate(req.end_date, "yyyy/MM/dd")} ({formatDays(req.days)})</div>
                </div>
                <svg className={`h-5 w-5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-5 dark:border-gray-700 dark:bg-gray-900/50">
                  <div className="space-y-3">
                    {req.serial_number && (
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{locale === "zh-TW" ? "申請編號" : "No."}</span>
                        <span className="col-span-2 text-sm font-mono text-gray-900 dark:text-gray-100">{req.serial_number}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{locale === "zh-TW" ? "代理人" : "Delegates"}</span>
                      <div className="col-span-2">
                        {req.delegate_assignments?.length ? (
                          <div className="space-y-2">
                            {req.delegate_assignments.map((assignment) => (
                              <div key={assignment.delegate_id} className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-600 dark:bg-gray-800">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {employeeMap.get(assignment.delegate_id) || assignment.delegate_id}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  {assignment.dates.map((d) => format(new Date(d), "MM/dd", { locale: dateFnsLocale })).join(", ")}
                                </p>
                                {assignment.handover_note && (
                                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{assignment.handover_note}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {(req.delegate_ids?.length ? req.delegate_ids.map((id) => employeeMap.get(id)).filter(Boolean).join(", ") : null) || (locale === "zh-TW" ? "未指派" : "None assigned")}
                          </span>
                        )}
                      </div>
                    </div>
                    {req.notes && (
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{locale === "zh-TW" ? "備註" : "Notes"}</span>
                        <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">{req.notes}</span>
                      </div>
                    )}
                    {req.handover_url && (
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{locale === "zh-TW" ? "交接事項" : "Handover"}</span>
                        <span className="col-span-2 text-sm">
                          <a href={req.handover_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">{req.handover_url}</a>
                        </span>
                      </div>
                    )}
                    {/* Timeline */}
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{locale === "zh-TW" ? "時間軸" : "Timeline"}</span>
                      <div className="col-span-2 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"></div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(req.created_at, "yyyy/MM/dd HH:mm")}</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{locale === "zh-TW" ? "提出申請" : "Submitted"}</p>
                          </div>
                        </div>
                        {req.reviewed_at && req.status !== "pending" && (
                          <div className="flex items-start gap-3">
                            <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${req.status === "approved" ? "bg-green-500" : req.status === "rejected" ? "bg-red-500" : "bg-gray-400"}`}></div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(req.reviewed_at, "yyyy/MM/dd HH:mm")}</p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                {req.status === "cancelled"
                                  ? (req.reviewed_by === req.employee_id
                                    ? (locale === "zh-TW" ? "本人取消" : "Self-cancelled")
                                    : (locale === "zh-TW" ? `${employeeMap.get(req.reviewed_by!) || "未知"} 取消` : `${employeeMap.get(req.reviewed_by!) || "Unknown"} cancelled`))
                                  : (locale === "zh-TW"
                                    ? `${employeeMap.get(req.reviewed_by!) || "未知"} ${req.status === "approved" ? "核准" : "駁回"}`
                                    : `${employeeMap.get(req.reviewed_by!) || "Unknown"} ${req.status === "approved" ? "approved" : "rejected"}`)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {canCancel(req) && (
                      <div className="mt-3 flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
                        <button onClick={() => handleCancel(req.id)} disabled={cancellingId === req.id} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50">
                          {cancellingId === req.id ? (locale === "zh-TW" ? "取消中..." : "Cancelling...") : (locale === "zh-TW" ? "取消申請" : "Cancel Request")}
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
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("dashboard.welcome")}{session?.name || t("common.user")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {t("dashboard.overview")}
          </p>
        </div>
        <Link
          href="/leave/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          {t("dashboard.newLeaveRequest")}
        </Link>
      </div>

      {/* Balance cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("dashboard.leaveBalances")}
        </h2>
        {balancesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : balances.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {t("dashboard.noBalances")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((balance) => (
              <BalanceCard key={balance.leave_type} balance={balance} />
            ))}
          </div>
        )}
      </section>

      {/* Delegated to me */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {locale === "zh-TW" ? "代理中的工作" : "Delegated To Me"}
        </h2>
        {delegatedLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : delegatedLeaves.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {locale === "zh-TW" ? "目前沒有人委派工作給你。" : "No one has delegated work to you right now."}
          </div>
        ) : (
          <div className="space-y-2">
            {delegatedLeaves.map((leave) => {
              const isDelegatedExpanded = delegatedExpandedId === leave.id;
              const myAssignment = leave.delegate_assignments?.find(
                (a) => a.delegate_id === session?.employee_id
              );
              return (
                <div key={leave.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  {/* Desktop row */}
                  <button
                    onClick={() => setDelegatedExpandedId(isDelegatedExpanded ? null : leave.id)}
                    className="hidden w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 md:flex dark:hover:bg-gray-700/50"
                  >
                    <div className="flex items-center gap-6">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {leave.employee?.name || t("common.unknown")}
                      </span>
                      <LeaveTypeIcon type={leave.leave_type} showLabel />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(leave.start_date, "yyyy/MM/dd")} - {formatDate(leave.end_date, "yyyy/MM/dd")}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{formatDays(leave.days)}</span>
                    </div>
                    <svg className={`h-5 w-5 text-gray-400 transition-transform dark:text-gray-500 ${isDelegatedExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {/* Mobile row */}
                  <button
                    onClick={() => setDelegatedExpandedId(isDelegatedExpanded ? null : leave.id)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50 md:hidden dark:hover:bg-gray-700/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {leave.employee?.name || t("common.unknown")}
                        </span>
                        <LeaveTypeIcon type={leave.leave_type} showLabel />
                      </div>
                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(leave.start_date, "yyyy/MM/dd")} - {formatDate(leave.end_date, "yyyy/MM/dd")} ({formatDays(leave.days)})
                      </div>
                    </div>
                    <svg className={`h-5 w-5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${isDelegatedExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {/* Expanded detail */}
                  {isDelegatedExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-6 py-5 dark:border-gray-700 dark:bg-gray-900/50">
                      <div className="space-y-3">
                        {myAssignment && (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                {locale === "zh-TW" ? "負責日期" : "My dates"}
                              </span>
                              <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                                {myAssignment.dates.map((d) => formatDate(d, "MM/dd")).join(", ")}
                              </span>
                            </div>
                            {myAssignment.handover_note && (
                              <div className="grid grid-cols-3 gap-2">
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                  {locale === "zh-TW" ? "交接說明" : "Handover note"}
                                </span>
                                <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                                  {myAssignment.handover_note}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {leave.handover_url && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW" ? "交接文件" : "Handover doc"}
                            </span>
                            <span className="col-span-2 text-sm">
                              <a href={leave.handover_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                                {leave.handover_url}
                              </a>
                            </span>
                          </div>
                        )}
                        {leave.notes && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW" ? "備註" : "Notes"}
                            </span>
                            <span className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                              {leave.notes}
                            </span>
                          </div>
                        )}
                        {!myAssignment && !leave.handover_url && !leave.notes && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {locale === "zh-TW" ? "沒有額外的交接資訊。" : "No additional handover details."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Leave request sections */}
      {requestsLoading ? (
        <section>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        </section>
      ) : requests.length === 0 ? (
        <section>
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {t("dashboard.noRequests")}{" "}
            <Link
              href="/leave/new"
              className="text-blue-500 underline hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {t("dashboard.createFirst")}
            </Link>
            .
          </div>
        </section>
      ) : (
        <>
          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-yellow-600 dark:text-yellow-400">
                {locale === "zh-TW" ? "⏳ 等待審核中" : "⏳ Pending Review"}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({pendingRequests.length})</span>
              </h2>
              {renderRequestCards(pendingRequests)}
            </section>
          )}

          {/* Upcoming approved */}
          {upcomingApproved.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-green-600 dark:text-green-400">
                {locale === "zh-TW" ? "✅ 即將到來的假期" : "✅ Upcoming Leave"}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({upcomingApproved.length})</span>
              </h2>
              {renderRequestCards(upcomingApproved)}
            </section>
          )}

          {/* Past approved */}
          {pastApproved.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-500 dark:text-gray-400">
                {locale === "zh-TW" ? "📋 已休假紀錄" : "📋 Past Leave"}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({pastApproved.length})</span>
              </h2>
              {renderRequestCards(pastApproved)}
            </section>
          )}

          {/* Rejected / Cancelled */}
          {otherRequests.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-400 dark:text-gray-500">
                {locale === "zh-TW" ? "🗂️ 已駁回 / 已取消" : "🗂️ Rejected / Cancelled"}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({otherRequests.length})</span>
              </h2>
              {renderRequestCards(otherRequests)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
