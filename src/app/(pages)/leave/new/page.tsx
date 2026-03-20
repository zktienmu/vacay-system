"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  differenceInBusinessDays,
  isWeekend,
  parseISO,
  format,
  addDays,
} from "date-fns";
import { useLeaveBalance } from "@/hooks/useLeaveBalance";
import { useEmployees } from "@/hooks/useEmployees";
import { useSession } from "@/hooks/useSession";
import { getLeaveTypeEmoji } from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import type { LeaveType, ApiResponse } from "@/types";

const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "official",
  "unpaid",
  "remote",
];

function countWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (endDate < startDate) return 0;

  let count = 0;
  let current = startDate;
  while (current <= endDate) {
    if (!isWeekend(current)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
}

export default function NewLeavePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { balances, isLoading: balancesLoading } = useLeaveBalance();
  const { employees, isLoading: employeesLoading } = useEmployees();
  const { t, locale } = useTranslation();

  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workingDays = useMemo(
    () => countWorkingDays(startDate, endDate),
    [startDate, endDate]
  );

  const currentBalance = balances.find((b) => b.leave_type === leaveType);
  const remainingAfter =
    currentBalance != null
      ? currentBalance.remaining_days - workingDays
      : null;

  const otherEmployees = employees.filter(
    (e) => e.id !== session?.employee_id
  );

  const leaveTypeLabel = (type: LeaveType) => t(`leave.types.${type}` as `leave.types.${LeaveType}`);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!startDate) errors.push(t("leave.validationStartDate"));
    if (!endDate) errors.push(t("leave.validationEndDate"));
    if (startDate && endDate && parseISO(endDate) < parseISO(startDate)) {
      errors.push(t("leave.validationEndAfterStart"));
    }
    if (workingDays === 0 && startDate && endDate) {
      errors.push(t("leave.validationNoWorkingDays"));
    }
    if (remainingAfter !== null && remainingAfter < 0) {
      errors.push(
        t("leave.validationInsufficientBalance", {
          remaining: String(currentBalance?.remaining_days ?? 0),
          type: leaveTypeLabel(leaveType),
        })
      );
    }
    return errors;
  }, [startDate, endDate, workingDays, remainingAfter, currentBalance, leaveType, t, locale]);

  const canSubmit =
    startDate && endDate && workingDays > 0 && validationErrors.length === 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          delegate_id: delegateId || null,
          notes: notes.trim() || null,
        }),
      });

      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to create leave request");
      }

      queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
      queryClient.invalidateQueries({ queryKey: ["leaveBalance"] });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const today = format(new Date(), "yyyy-MM-dd");

  function formatDays(n: number) {
    if (locale === "zh-TW") return `${n} ${t("common.day")}`;
    return `${n} day${n !== 1 && n !== -1 ? "s" : ""}`;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("leave.newRequest")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t("leave.newRequestDesc")}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        {/* Leave type */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("leave.leaveType")}
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {getLeaveTypeEmoji(type)} {leaveTypeLabel(type)}
              </option>
            ))}
          </select>
          {currentBalance && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("leave.balance")}: {currentBalance.remaining_days} / {currentBalance.total_days} {t("leave.daysRemaining")}
            </p>
          )}
        </div>

        {/* Date range */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("leave.startDate")}
            </label>
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value > endDate) {
                  setEndDate(e.target.value);
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("leave.endDate")}
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || today}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Working days calculation */}
        {startDate && endDate && (
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {t("leave.workingDays")}
              </span>
              <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                {formatDays(workingDays)}
              </span>
            </div>
            {remainingAfter !== null && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {t("leave.remainingAfter")}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    remainingAfter < 0 ? "text-red-600 dark:text-red-400" : "text-blue-900 dark:text-blue-100"
                  }`}
                >
                  {formatDays(remainingAfter)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Delegate */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("leave.delegate")}
          </label>
          <select
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            disabled={employeesLoading}
          >
            <option value="">{t("common.noDelegate")}</option>
            {otherEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("leave.delegateHint")}
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("leave.notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("leave.notesPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && startDate && endDate && (
          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
            <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit error */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t("leave.submitting")}
              </span>
            ) : (
              t("leave.submitRequest")
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
