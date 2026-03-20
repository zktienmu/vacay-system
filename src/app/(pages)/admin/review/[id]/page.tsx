"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import { useSession } from "@/hooks/useSession";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import type { ApiResponse, LeaveRequestWithEmployee } from "@/types";

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useSession();
  const { t, locale } = useTranslation();
  const id = params.id as string;

  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  function formatDate(date: string, fmt: string) {
    return format(new Date(date), fmt, { locale: dateFnsLocale });
  }

  const [request, setRequest] = useState<LeaveRequestWithEmployee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function fetchRequest() {
      try {
        const res = await fetch(`/api/leave?all=true`);
        const json: ApiResponse<LeaveRequestWithEmployee[]> = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || "Failed to fetch leave request");
        }
        const found = json.data.find((r) => r.id === id);
        if (!found) {
          throw new Error("Leave request not found");
        }
        setRequest(found);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setIsLoading(false);
      }
    }

    fetchRequest();
  }, [id]);

  if (session?.role !== "admin") {
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

  async function handleAction(status: "approved" | "rejected") {
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
      router.push("/admin");
    } catch {
      alert(t("admin.failedUpdate"));
    } finally {
      setActionLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("common.notFound")}</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{error || t("review.notFoundDesc")}</p>
          <Link
            href="/admin"
            className="mt-4 inline-block text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t("review.backToReview")}
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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
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
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          {t("review.backToReview")}
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t("review.requestDetail")}
          </h1>
          <LeaveStatusBadge status={request.status} />
        </div>

        <div className="space-y-4">
          {/* Employee */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("review.employee")}</div>
            <div className="col-span-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {request.employee?.name || t("common.unknown")}
              </p>
              {request.employee?.wallet_address && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {truncateAddress(request.employee.wallet_address)}
                </p>
              )}
            </div>
          </div>

          {/* Leave type */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("review.leaveType")}</div>
            <div className="col-span-2">
              <LeaveTypeIcon type={request.leave_type} showLabel />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("review.dates")}</div>
            <div className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
              {formatDate(request.start_date, "MMMM d, yyyy")} -{" "}
              {formatDate(request.end_date, "MMMM d, yyyy")}
            </div>
          </div>

          {/* Days */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("review.workingDays")}
            </div>
            <div className="col-span-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatDays(request.days)}
            </div>
          </div>

          {/* Delegate */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("review.delegate")}</div>
            <div className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
              {request.delegate?.name || t("review.noneAssigned")}
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("review.notes")}</div>
            <div className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
              {request.notes || t("common.noNotes")}
            </div>
          </div>

          {/* Submitted at */}
          <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("review.submitted")}
            </div>
            <div className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
              {formatDate(request.created_at, "MMMM d, yyyy 'at' h:mm a")}
            </div>
          </div>

          {/* Reviewer info (if reviewed) */}
          {request.reviewed_by && request.reviewer && (
            <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t("review.reviewedBy")}
              </div>
              <div className="col-span-2 text-sm text-gray-900 dark:text-gray-100">
                {request.reviewer.name}
                {request.reviewed_at && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {" "}
                    {t("review.on")}{" "}
                    {formatDate(request.reviewed_at, "MMMM d, yyyy 'at' h:mm a")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {request.status === "pending" && (
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              onClick={() => handleAction("rejected")}
              disabled={actionLoading}
              className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {t("admin.reject")}
            </button>
            <button
              onClick={() => handleAction("approved")}
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
        )}
      </div>
    </div>
  );
}
