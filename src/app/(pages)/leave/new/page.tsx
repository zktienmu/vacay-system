"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  isWeekend,
  parseISO,
  format,
  addDays,
} from "date-fns";
import { useLeaveBalance } from "@/hooks/useLeaveBalance";
import { useSlackUsers } from "@/hooks/useSlackUsers";
import { useSession } from "@/hooks/useSession";
import { getLeaveTypeEmoji } from "@/components/LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import { useQuery } from "@tanstack/react-query";
import type { LeaveType, ApiResponse, DelegateAssignment, ChainDelegation } from "@/types";

const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "official",
  "unpaid",
  "remote",
];

/** Day-of-week abbreviations for column headers */
const DAY_LABELS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

/** Get all working day date strings in a range (excludes weekends) */
function getWorkingDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (endDate < startDate) return [];

  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    if (!isWeekend(current)) {
      dates.push(format(current, "yyyy-MM-dd"));
    }
    current = addDays(current, 1);
  }
  return dates;
}

export default function NewLeavePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { balances } = useLeaveBalance();
  const { slackUsers, isLoading: slackUsersLoading } = useSlackUsers();
  const { data: employeeList = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["employeeList"],
    queryFn: async () => {
      const res = await fetch("/api/employees/list");
      const json: ApiResponse<{ id: string; name: string }[]> = await res.json();
      if (!json.success || !json.data) return [];
      return json.data;
    },
  });
  const { t, locale } = useTranslation();

  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Matrix state: { delegateId -> Set<dateString> }
  const [delegateMatrix, setDelegateMatrix] = useState<Record<string, Set<string>>>({});
  // Per-delegate handover notes
  const [delegateNotes, setDelegateNotes] = useState<Record<string, string>>({});
  const [handoverUrl, setHandoverUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workingDays = useMemo(
    () => countWorkingDays(startDate, endDate),
    [startDate, endDate]
  );

  const workingDates = useMemo(
    () => getWorkingDates(startDate, endDate),
    [startDate, endDate]
  );

  const currentBalance = balances.find((b) => b.leave_type === leaveType);
  const isUnlimited = currentBalance?.total_days === -1;
  const hasTransition = currentBalance?.transition_days != null && currentBalance?.transition_used_days != null;
  const transitionRemaining = hasTransition
    ? currentBalance.transition_days! - currentBalance.transition_used_days!
    : 0;
  const totalRemaining = (currentBalance?.remaining_days ?? 0) + transitionRemaining;
  const remainingAfter =
    currentBalance != null && !isUnlimited
      ? totalRemaining - workingDays
      : null;

  // Use Slack users if available, otherwise fall back to employee list
  const slackCandidates = slackUsers.filter((u) => u.employee_id);
  const delegateCandidates = useMemo(() => {
    if (slackCandidates.length > 0) {
      return slackCandidates.map((u) => ({
        id: u.employee_id!,
        name: u.display_name || u.name,
      }));
    }
    return employeeList
      .filter((e) => e.id !== session?.employee_id)
      .map((e) => ({ id: e.id, name: e.name }));
  }, [slackCandidates, employeeList, session?.employee_id]);
  const delegatesLoading = slackUsersLoading && employeesLoading;

  // Fetch conflicts when both dates are set
  const { data: conflicts = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["leaveConflicts", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/leave/conflicts?start_date=${startDate}&end_date=${endDate}`
      );
      const json: ApiResponse<Record<string, string[]>> = await res.json();
      if (!json.success || !json.data) return {};
      return json.data;
    },
    enabled: !!startDate && !!endDate && workingDays > 0,
  });

  const leaveTypeLabel = (type: LeaveType) => t(`leave.types.${type}` as `leave.types.${LeaveType}`);

  const handoverRequired = workingDays >= 3;

  // Derive selected delegate IDs from the matrix
  const selectedDelegateIds = useMemo(() => {
    return Object.entries(delegateMatrix)
      .filter(([, dates]) => dates.size > 0)
      .map(([id]) => id);
  }, [delegateMatrix]);

  // Chain delegation: detect if current user is a delegate for someone else on overlapping dates
  interface ChainDuty {
    original_leave_id: string;
    original_employee_id: string;
    original_employee_name: string;
    overlapping_dates: string[];
    handover_note: string | null;
  }

  const { data: chainDuties = [] } = useQuery<ChainDuty[]>({
    queryKey: ["chainDuties", startDate, endDate, session?.employee_id],
    queryFn: async () => {
      const res = await fetch(
        `/api/leave/chain-duties?start_date=${startDate}&end_date=${endDate}`
      );
      const json: ApiResponse<ChainDuty[]> = await res.json();
      return json.success && json.data ? json.data : [];
    },
    enabled: !!startDate && !!endDate && workingDays > 0,
  });

  // Chain reassignment: { originalLeaveId -> reassignedToDelegateId }
  const [chainReassignments, setChainReassignments] = useState<Record<string, string>>({});

  // Auto-fill chain reassignments when only 1 delegate is selected; clean up orphaned assignments
  useEffect(() => {
    if (chainDuties.length === 0) return;
    if (selectedDelegateIds.length === 1) {
      const auto: Record<string, string> = {};
      for (const duty of chainDuties) {
        auto[duty.original_leave_id] = selectedDelegateIds[0];
      }
      setChainReassignments(auto);
    } else {
      setChainReassignments((prev) => {
        const cleaned: Record<string, string> = {};
        for (const [leaveId, delegateId] of Object.entries(prev)) {
          if (selectedDelegateIds.includes(delegateId)) {
            cleaned[leaveId] = delegateId;
          }
        }
        return cleaned;
      });
    }
  }, [selectedDelegateIds, chainDuties]);

  // Check if a delegate is on leave for a specific date
  const isOnLeave = useCallback(
    (delegateId: string, date: string): boolean => {
      return conflicts[delegateId]?.includes(date) ?? false;
    },
    [conflicts]
  );

  // Check if every working date has at least one delegate assigned
  const allDatesCovered = useMemo(() => {
    if (workingDates.length === 0) return false;
    return workingDates.every((date) =>
      Object.values(delegateMatrix).some((dates) => dates.has(date))
    );
  }, [workingDates, delegateMatrix]);

  // Toggle a cell in the matrix
  const toggleMatrixCell = useCallback(
    (delegateId: string, date: string) => {
      setDelegateMatrix((prev) => {
        const current = new Set(prev[delegateId] ?? []);
        if (current.has(date)) {
          current.delete(date);
        } else {
          current.add(date);
        }
        return { ...prev, [delegateId]: current };
      });
    },
    []
  );

  // Toggle all dates for a single-day delegate (checkbox list mode)
  const toggleDelegate = useCallback(
    (delegateId: string) => {
      if (workingDates.length === 0) return;
      setDelegateMatrix((prev) => {
        const current = new Set(prev[delegateId] ?? []);
        if (current.size > 0) {
          // Deselect
          return { ...prev, [delegateId]: new Set() };
        } else {
          // Select the single working date (filtered by availability)
          const available = workingDates.filter(
            (d) => !isOnLeave(delegateId, d)
          );
          return { ...prev, [delegateId]: new Set(available) };
        }
      });
    },
    [workingDates, isOnLeave]
  );

  // Build delegate_assignments from the matrix state
  const buildDelegateAssignments = useCallback((): DelegateAssignment[] => {
    const assignments: DelegateAssignment[] = [];
    for (const [delegateId, dates] of Object.entries(delegateMatrix)) {
      if (dates.size === 0) continue;
      assignments.push({
        delegate_id: delegateId,
        dates: Array.from(dates).sort(),
        handover_note: delegateNotes[delegateId]?.trim() ?? "",
      });
    }
    return assignments;
  }, [delegateMatrix, delegateNotes]);

  // Format date for column headers: MM/dd (一)
  const formatColumnHeader = useCallback(
    (dateStr: string) => {
      const date = parseISO(dateStr);
      const dayLabels = locale === "zh-TW" ? DAY_LABELS_ZH : DAY_LABELS_EN;
      const dayLabel = dayLabels[date.getDay()];
      return `${format(date, "MM/dd")} (${dayLabel})`;
    },
    [locale]
  );

  // Check if any delegate has conflicting dates (for display label)
  const hasAnyConflict = useCallback(
    (delegateId: string): boolean => {
      return workingDates.some((d) => isOnLeave(delegateId, d));
    },
    [workingDates, isOnLeave]
  );

  // Are all working dates conflicted for a delegate?
  const isFullyOnLeave = useCallback(
    (delegateId: string): boolean => {
      return workingDates.length > 0 && workingDates.every((d) => isOnLeave(delegateId, d));
    },
    [workingDates, isOnLeave]
  );

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
          remaining: String(totalRemaining),
          type: leaveTypeLabel(leaveType),
        })
      );
    }
    if (handoverRequired && !handoverUrl.trim()) {
      errors.push(
        locale === "zh-TW"
          ? "連續請假 3 天以上需提供交接事項網址"
          : "Handover document URL is required for leaves of 3+ working days"
      );
    }
    if (leaveType !== "remote" && selectedDelegateIds.length === 0) {
      errors.push(
        locale === "zh-TW"
          ? "請選擇至少一位代理人"
          : "At least one delegate is required"
      );
    }
    if (leaveType !== "remote" && workingDays >= 2 && selectedDelegateIds.length > 0 && !allDatesCovered) {
      errors.push(
        locale === "zh-TW"
          ? "每個工作日都需要至少一位代理人"
          : "Every working day must have at least one delegate assigned"
      );
    }
    // Chain delegation: every inherited duty must have an assigned delegate
    if (chainDuties.length > 0 && selectedDelegateIds.length > 0) {
      const allChainAssigned = chainDuties.every(
        (d) => chainReassignments[d.original_leave_id]
      );
      if (!allChainAssigned) {
        errors.push(
          locale === "zh-TW"
            ? "請為每項代理轉移指定接手人"
            : "Please assign a delegate for each inherited duty"
        );
      }
    }
    // Per-delegate handover notes required when handover_url is NOT required (< 3 days) and delegates are selected
    if (!handoverRequired && selectedDelegateIds.length > 0) {
      const missingNotes = selectedDelegateIds.some(
        (id) => !delegateNotes[id]?.trim()
      );
      if (missingNotes) {
        errors.push(
          locale === "zh-TW"
            ? "請為每位代理人填寫交接事項"
            : "Handover notes are required for each delegate"
        );
      }
    }
    return errors;
  }, [startDate, endDate, workingDays, remainingAfter, currentBalance, leaveType, t, locale, handoverRequired, handoverUrl, selectedDelegateIds, allDatesCovered, delegateNotes, chainDuties, chainReassignments]);

  const canSubmit =
    startDate && endDate && workingDays > 0 && validationErrors.length === 0 && !submitting &&
    (!handoverRequired || handoverUrl.trim() !== "") && (leaveType === "remote" || selectedDelegateIds.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const delegateAssignments = buildDelegateAssignments();
      const delegateIds = [...new Set(delegateAssignments.map((a) => a.delegate_id))];

      // Build chain_delegations from chain duties + reassignments
      const chainDelegationsPayload: ChainDelegation[] = chainDuties
        .filter((d) => chainReassignments[d.original_leave_id])
        .map((d) => ({
          original_leave_id: d.original_leave_id,
          original_employee_id: d.original_employee_id,
          reassigned_to: chainReassignments[d.original_leave_id],
          dates: d.overlapping_dates,
          handover_note: d.handover_note,
        }));

      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          delegate_ids: delegateIds,
          delegate_assignments: delegateAssignments,
          ...(chainDelegationsPayload.length > 0 && {
            chain_delegations: chainDelegationsPayload,
          }),
          handover_url: handoverUrl.trim() || null,
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

  // Render delegate checkbox list (for workingDays === 1)
  function renderSingleDayDelegates() {
    const singleDate = workingDates[0];

    return (
      <div className="grid grid-cols-2 gap-2">
        {delegateCandidates.map((c) => {
          const onLeave = singleDate ? isOnLeave(c.id, singleDate) : false;
          const checked = (delegateMatrix[c.id]?.size ?? 0) > 0;
          return (
            <label
              key={c.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                onLeave
                  ? "cursor-not-allowed bg-gray-100 opacity-50 dark:bg-gray-700"
                  : checked
                    ? "cursor-pointer bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "cursor-pointer text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={onLeave}
                onChange={() => toggleDelegate(c.id)}
                className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700"
              />
              <span>{c.name}</span>
              {onLeave && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {locale === "zh-TW" ? "(休假中)" : "(On leave)"}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  // Render delegate matrix table (for workingDays >= 2)
  function renderDelegateMatrix() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {locale === "zh-TW" ? "同事" : "Colleague"}
              </th>
              {workingDates.map((date) => (
                <th
                  key={date}
                  className="whitespace-nowrap px-2 py-2 text-center font-medium text-gray-600 dark:text-gray-400"
                >
                  {formatColumnHeader(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {delegateCandidates.map((c) => {
              const fullyOnLeave = isFullyOnLeave(c.id);
              return (
                <tr
                  key={c.id}
                  className={fullyOnLeave ? "opacity-50" : ""}
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    <span className="flex items-center gap-1">
                      {c.name}
                      {hasAnyConflict(c.id) && (
                        <span className="text-xs text-amber-500 dark:text-amber-400">
                          {locale === "zh-TW" ? "(部分休假)" : "(partial leave)"}
                        </span>
                      )}
                      {fullyOnLeave && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {locale === "zh-TW" ? "(休假中)" : "(On leave)"}
                        </span>
                      )}
                    </span>
                  </td>
                  {workingDates.map((date) => {
                    const onLeave = isOnLeave(c.id, date);
                    const checked = delegateMatrix[c.id]?.has(date) ?? false;
                    return (
                      <td key={date} className="px-2 py-2 text-center">
                        {onLeave ? (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-xs text-gray-400 dark:bg-gray-700 dark:text-gray-500"
                            title={
                              locale === "zh-TW"
                                ? `${c.name} 在 ${date} 休假中`
                                : `${c.name} is on leave on ${date}`
                            }
                          >
                            &times;
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMatrixCell(c.id, date)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Column coverage indicator */}
        <div className="mt-2 flex gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {locale === "zh-TW" ? "日期覆蓋：" : "Date coverage: "}
          </span>
          {workingDates.map((date) => {
            const covered = Object.values(delegateMatrix).some((dates) =>
              dates.has(date)
            );
            return (
              <span
                key={date}
                className={`inline-block h-3 w-3 rounded-full ${
                  covered
                    ? "bg-green-400 dark:bg-green-500"
                    : "bg-red-300 dark:bg-red-500"
                }`}
                title={`${formatColumnHeader(date)}: ${covered ? (locale === "zh-TW" ? "已覆蓋" : "covered") : (locale === "zh-TW" ? "未覆蓋" : "uncovered")}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Render per-delegate handover notes (when handover_url is NOT required)
  function renderDelegateHandoverNotes() {
    if (selectedDelegateIds.length === 0) return null;

    return (
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {locale === "zh-TW" ? "交接事項" : "Handover Notes"}{" "}
          <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-600">
          {selectedDelegateIds.map((id) => {
            const candidate = delegateCandidates.find((c) => c.id === id);
            if (!candidate) return null;
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {candidate.name}:
                </span>
                <input
                  type="text"
                  value={delegateNotes[id] ?? ""}
                  onChange={(e) =>
                    setDelegateNotes((prev) => ({
                      ...prev,
                      [id]: e.target.value,
                    }))
                  }
                  placeholder={
                    locale === "zh-TW"
                      ? "請填寫交接事項..."
                      : "Enter handover notes..."
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render optional per-delegate handover notes (when handover_url IS required)
  function renderOptionalDelegateHandoverNotes() {
    if (selectedDelegateIds.length === 0) return null;

    return (
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {locale === "zh-TW" ? "代理人備註" : "Delegate Notes"}{" "}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({locale === "zh-TW" ? "選填" : "optional"})
          </span>
        </label>
        <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-600">
          {selectedDelegateIds.map((id) => {
            const candidate = delegateCandidates.find((c) => c.id === id);
            if (!candidate) return null;
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {candidate.name}:
                </span>
                <input
                  type="text"
                  value={delegateNotes[id] ?? ""}
                  onChange={(e) =>
                    setDelegateNotes((prev) => ({
                      ...prev,
                      [id]: e.target.value,
                    }))
                  }
                  placeholder={
                    locale === "zh-TW"
                      ? "選填備註..."
                      : "Optional notes..."
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
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
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("leave.balance")}:{" "}
                {isUnlimited
                  ? (locale === "zh-TW" ? "無限制" : "Unlimited")
                  : `${currentBalance.remaining_days} / ${currentBalance.total_days} ${t("leave.daysRemaining")}`}
              </p>
              {hasTransition && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {locale === "zh-TW"
                    ? `過渡期：${transitionRemaining} / ${currentBalance.transition_days} 天`
                    : `Transition: ${transitionRemaining} / ${currentBalance.transition_days} days`}
                </p>
              )}
            </div>
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
                // Reset delegate matrix when dates change
                setDelegateMatrix({});
                setDelegateNotes({});
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
              onChange={(e) => {
                setEndDate(e.target.value);
                // Reset delegate matrix when dates change
                setDelegateMatrix({});
                setDelegateNotes({});
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Working days calculation */}
        <div className={`rounded-lg p-4 ${startDate && endDate && workingDays > 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-gray-50 dark:bg-gray-700/50"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${startDate && endDate && workingDays > 0 ? "text-blue-700 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}>
              {t("leave.workingDays")}
            </span>
            <span className={`text-lg font-bold ${startDate && endDate && workingDays > 0 ? "text-blue-900 dark:text-blue-100" : "text-gray-400 dark:text-gray-500"}`}>
              {startDate && endDate ? formatDays(workingDays) : "\u2014"}
            </span>
          </div>
          {remainingAfter !== null && startDate && endDate && (
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

        {/* Delegates (not needed for remote) */}
        {leaveType !== "remote" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("leave.delegate")} <span className="text-red-500">*</span>
          </label>
          <div className={`rounded-lg border px-3 py-2.5 ${
            selectedDelegateIds.length === 0
              ? "border-gray-300 dark:border-gray-600"
              : "border-blue-400 dark:border-blue-500"
          }`}>
            {delegatesLoading ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t("common.loading")}
              </p>
            ) : delegateCandidates.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {locale === "zh-TW" ? "沒有可選的代理人" : "No delegates available"}
              </p>
            ) : workingDays === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {locale === "zh-TW" ? "請先選擇日期" : "Please select dates first"}
              </p>
            ) : workingDays === 1 ? (
              renderSingleDayDelegates()
            ) : (
              renderDelegateMatrix()
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {workingDays >= 2
              ? (locale === "zh-TW"
                  ? "每個工作日都需要至少一位代理人負責"
                  : "Each working day must have at least one delegate assigned")
              : t("leave.delegateHint")}
          </p>

          {/* Handover notes per delegate */}
          {workingDays > 0 && !handoverRequired && renderDelegateHandoverNotes()}
          {workingDays > 0 && handoverRequired && renderOptionalDelegateHandoverNotes()}

          {/* Chain delegation reassignment */}
          {chainDuties.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20">
              <p className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-300">
                {locale === "zh-TW"
                  ? "⚠️ 你目前是以下同事的代理人，請指定接手人"
                  : "⚠️ You are currently a delegate for the following colleagues. Please assign a replacement."}
              </p>
              <div className="space-y-3">
                {chainDuties.map((duty) => {
                  const shortDates = duty.overlapping_dates
                    .map((d) => {
                      const date = parseISO(d);
                      return format(date, "MM/dd");
                    })
                    .join(", ");
                  return (
                    <div
                      key={duty.original_leave_id}
                      className="rounded-md border border-amber-200 bg-white p-3 dark:border-amber-700 dark:bg-gray-800"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {duty.original_employee_name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {shortDates}
                        </span>
                      </div>
                      {duty.handover_note && (
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          {locale === "zh-TW" ? "交接備註：" : "Handover: "}
                          {duty.handover_note}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {locale === "zh-TW" ? "指定接手人：" : "Assign to: "}
                        </span>
                        {selectedDelegateIds.length === 0 ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {locale === "zh-TW"
                              ? "請先選擇代理人"
                              : "Please select delegates first"}
                          </span>
                        ) : (
                          <select
                            value={chainReassignments[duty.original_leave_id] ?? ""}
                            onChange={(e) =>
                              setChainReassignments((prev) => ({
                                ...prev,
                                [duty.original_leave_id]: e.target.value,
                              }))
                            }
                            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">
                              {locale === "zh-TW" ? "-- 請選擇 --" : "-- Select --"}
                            </option>
                            {selectedDelegateIds.map((id) => {
                              const candidate = delegateCandidates.find((c) => c.id === id);
                              return (
                                <option key={id} value={id}>
                                  {candidate?.name ?? id}
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Handover URL (always visible, required when >= 3 working days) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {locale === "zh-TW" ? "交接文件連結" : "Handover Document URL"}
            {handoverRequired && (
              <span className="ml-1 text-red-500">*</span>
            )}
          </label>
          <input
            type="url"
            value={handoverUrl}
            onChange={(e) => setHandoverUrl(e.target.value)}
            placeholder="https://..."
            className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:bg-gray-700 dark:text-gray-100 ${
              handoverRequired && !handoverUrl.trim()
                ? "border-red-400 dark:border-red-500"
                : "border-gray-300 dark:border-gray-600"
            }`}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {handoverRequired
              ? (locale === "zh-TW"
                  ? "連續請假 3 天以上需提供交接事項文件連結"
                  : "A handover document URL is required for leaves of 3 or more working days")
              : (locale === "zh-TW"
                  ? "選填，可提供交接事項文件連結"
                  : "Optional \u2014 provide a handover document URL if needed")}
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
