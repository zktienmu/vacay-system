"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import { useSession } from "@/hooks/useSession";
import { useEmployees } from "@/hooks/useEmployees";
import { useTranslation } from "@/lib/i18n/context";
import { getLeaveTypeEmoji } from "@/components/LeaveTypeIcon";
import type {
  Employee,
  LeaveType,
  LeavePolicy,
  LeaveRequest,
  ApiResponse,
} from "@/types";

const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "unpaid",
  "remote",
  "family_care",
  "menstrual",
];

// Transition period: from 2026/1/1 to the day before the next employment anniversary
function calculateTransitionPeriod(startDate: string) {
  const start = new Date(startDate);
  // Find the next anniversary date after 2026-01-01
  let nextYear = 2026;
  let nextAnniversary = new Date(nextYear, start.getMonth(), start.getDate());
  while (nextAnniversary <= new Date("2026-01-01")) {
    nextYear += 1;
    nextAnniversary = new Date(nextYear, start.getMonth(), start.getDate());
  }
  const periodEnd = new Date(nextYear, start.getMonth(), start.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { periodStart: "2026-01-01", periodEnd: fmt(periodEnd) };
}

// Formal annual leave period: starts the day after transition ends, lasts one year
function calculateFormalPeriod(startDate: string) {
  const transition = calculateTransitionPeriod(startDate);
  const periodStart = new Date(transition.periodEnd);
  periodStart.setDate(periodStart.getDate() + 1);
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  periodEnd.setDate(periodEnd.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { periodStart: fmt(periodStart), periodEnd: fmt(periodEnd) };
}

export default function TransitionPage() {
  const { session } = useSession();
  const { employees, isLoading, refetch } = useEmployees();
  const { t, locale } = useTranslation();
  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Backfill form
  const [backfillForm, setBackfillForm] = useState({
    leave_type: "annual" as LeaveType,
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillSuccess, setBackfillSuccess] = useState(false);

  // Track backfill counts per employee (populated on expand)
  const [backfillCounts, setBackfillCounts] = useState<Record<string, number>>(
    {},
  );

  // Formal annual leave
  const [formalLeaves, setFormalLeaves] = useState<LeaveRequest[]>([]);
  const [annualPolicyDays, setAnnualPolicyDays] = useState<number>(0);

  // Transition annual days
  const [transitionDays, setTransitionDays] = useState<string>("");
  const [transitionSaved, setTransitionSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTransitionDays = useCallback(
    async (employeeId: string, value: number | null) => {
      try {
        const res = await fetch(`/api/employees/${employeeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transition_annual_days: value }),
        });
        const json: ApiResponse = await res.json();
        if (json.success) {
          setTransitionSaved(true);
          setTimeout(() => setTransitionSaved(false), 2000);
          refetch();
        }
      } catch {
        // silent
      }
    },
    [refetch],
  );

  const expandedEmployee = useMemo(
    () => employees.find((e) => e.id === expandedId) ?? null,
    [employees, expandedId],
  );

  const period = useMemo(
    () =>
      expandedEmployee
        ? calculateTransitionPeriod(expandedEmployee.start_date)
        : null,
    [expandedEmployee],
  );

  const formalPeriod = useMemo(
    () =>
      expandedEmployee
        ? calculateFormalPeriod(expandedEmployee.start_date)
        : null,
    [expandedEmployee],
  );

  if (session?.role !== "admin") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t("common.accessDenied")}
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {t("common.accessDeniedDesc")}
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-accent hover:text-accent-hover"
          >
            {t("common.goToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  async function fetchEmployeeData(emp: Employee) {
    const transitionPeriod = calculateTransitionPeriod(emp.start_date);
    const formal = calculateFormalPeriod(emp.start_date);

    let newTransitionLeaves: LeaveRequest[] = [];
    let newFormalLeaves: LeaveRequest[] = [];
    let policyDays = 0;

    try {
      const [allLeavesRes, policiesRes] = await Promise.all([
        fetch(
          `/api/leave?all=true&employee_id=${emp.id}&status=approved&start_date=2026-01-01&end_date=${formal.periodEnd}`,
        ),
        fetch(`/api/employees/${emp.id}/policies`),
      ]);

      if (allLeavesRes.ok) {
        const json: ApiResponse<LeaveRequest[]> = await allLeavesRes.json();
        if (json.success && json.data) {
          newTransitionLeaves = json.data.filter(
            (l) =>
              l.start_date >= transitionPeriod.periodStart &&
              l.start_date <= transitionPeriod.periodEnd,
          );
          newFormalLeaves = json.data.filter(
            (l) =>
              l.start_date >= formal.periodStart &&
              l.start_date <= formal.periodEnd,
          );
        }
      }

      if (policiesRes.ok) {
        const json: ApiResponse<LeavePolicy[]> = await policiesRes.json();
        if (json.success && json.data) {
          const annualPolicy = json.data.find(
            (p) => p.leave_type === "annual",
          );
          policyDays = annualPolicy?.total_days ?? 0;
        }
      }
    } catch {
      // Network error — show empty state gracefully
    }

    setLeaves(newTransitionLeaves);
    setFormalLeaves(newFormalLeaves);
    setAnnualPolicyDays(policyDays);
    setBackfillCounts((prev) => ({
      ...prev,
      [emp.id]: newTransitionLeaves.length + newFormalLeaves.length,
    }));
  }

  async function toggleExpand(emp: Employee) {
    if (expandedId === emp.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(emp.id);
    setDataLoading(true);
    setBackfillError(null);
    setBackfillSuccess(false);
    setTransitionSaved(false);
    setTransitionDays(
      emp.transition_annual_days != null
        ? String(emp.transition_annual_days)
        : "",
    );
    setBackfillForm({
      leave_type: "annual",
      start_date: "",
      end_date: "",
      notes: "",
    });

    try {
      await fetchEmployeeData(emp);
    } catch {
      // handled inside fetchEmployeeData
    } finally {
      setDataLoading(false);
    }
  }

  async function handleBackfill(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedEmployee) return;
    setBackfillLoading(true);
    setBackfillError(null);
    setBackfillSuccess(false);

    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: backfillForm.leave_type,
          start_date: backfillForm.start_date,
          end_date: backfillForm.end_date,
          notes: backfillForm.notes || null,
          for_employee_id: expandedEmployee.id,
        }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to create backfill leave");
      }

      setBackfillForm({
        leave_type: backfillForm.leave_type,
        start_date: "",
        end_date: "",
        notes: "",
      });
      setBackfillSuccess(true);
      setTimeout(() => setBackfillSuccess(false), 3000);
      await fetchEmployeeData(expandedEmployee);
    } catch (err) {
      setBackfillError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBackfillLoading(false);
    }
  }

  async function handleCancelLeave(leaveId: string) {
    if (!expandedEmployee) return;
    if (
      !confirm(
        locale === "zh-TW"
          ? "確定要取消這筆假單嗎？"
          : "Cancel this leave entry?",
      )
    )
      return;

    try {
      const res = await fetch(`/api/leave/${leaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to cancel");
      }
      await fetchEmployeeData(expandedEmployee);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {locale === "zh-TW" ? "資料轉移" : "Data Transition"}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {locale === "zh-TW"
            ? "從 Google Sheet 遷移假單資料。補登的假單會直接核准，餘額自動扣除。"
            : "Migrate leave data from Google Sheets. Backfilled entries are auto-approved and balances update automatically."}
        </p>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => {
            const empPeriod = calculateTransitionPeriod(emp.start_date);
            const count = backfillCounts[emp.id];
            const isExpanded = expandedId === emp.id;
            return (
              <div
                key={emp.id}
                className={`overflow-hidden rounded-xl border bg-white transition-colors dark:bg-gray-800 ${
                  isExpanded
                    ? "border-accent/30 dark:border-accent/30"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                {/* Collapsed row */}
                <button
                  onClick={() => toggleExpand(emp)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {emp.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {emp.department === "admin"
                        ? locale === "zh-TW"
                          ? "行政"
                          : "Admin"
                        : locale === "zh-TW"
                          ? "工程"
                          : "Engineering"}
                      {" · "}
                      {locale === "zh-TW" ? "到職 " : "Since "}
                      {format(new Date(emp.start_date), "yyyy/MM/dd", {
                        locale: dateFnsLocale,
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-gray-400 sm:inline dark:text-gray-500">
                      {empPeriod.periodStart} ~ {empPeriod.periodEnd}
                    </span>
                    {count !== undefined && count > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {count}
                        {locale === "zh-TW" ? " 筆" : ""}
                      </span>
                    )}
                    <svg
                      className={`h-5 w-5 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${isExpanded ? "rotate-180" : ""}`}
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

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-5 dark:border-gray-700 dark:bg-gray-900/50">
                    {dataLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-accent dark:border-gray-700 dark:border-t-accent" />
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Anniversary period banner */}
                        {period && (
                          <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-900/20">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-medium text-accent">
                                  {locale === "zh-TW"
                                    ? "過渡期間"
                                    : "Transition Period"}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {period.periodStart} ~ {period.periodEnd}
                                </p>
                              </div>
                              <p className="text-xs text-accent">
                                {locale === "zh-TW"
                                  ? "只需補登此區間內的紀錄"
                                  : "Only backfill within this period"}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Transition annual leave quota */}
                        {(() => {
                          const usedAnnualDays = leaves
                            .filter((l) => l.leave_type === "annual")
                            .reduce((sum, l) => sum + l.days, 0);
                          const quota =
                            transitionDays !== ""
                              ? parseInt(transitionDays, 10)
                              : null;
                          const remaining =
                            quota != null ? quota - usedAnnualDays : null;

                          return (
                            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-800">
                              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {locale === "zh-TW"
                                  ? "過渡期特休"
                                  : "Transition Annual Leave"}
                              </h3>
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-gray-600 dark:text-gray-400">
                                    {locale === "zh-TW" ? "額度" : "Quota"}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="365"
                                    value={transitionDays}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTransitionDays(val);
                                      setTransitionSaved(false);
                                      if (debounceRef.current)
                                        clearTimeout(debounceRef.current);
                                      debounceRef.current = setTimeout(() => {
                                        if (!expandedEmployee) return;
                                        const num =
                                          val === "" ? null : parseInt(val, 10);
                                        if (
                                          num !== null &&
                                          (isNaN(num) || num < 0 || num > 365)
                                        )
                                          return;
                                        saveTransitionDays(
                                          expandedEmployee.id,
                                          num,
                                        );
                                      }, 300);
                                    }}
                                    className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-center text-sm tabular-nums text-gray-900 focus:border-accent focus:ring-2 focus:ring-[#FF5C00]/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    placeholder="—"
                                  />
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {locale === "zh-TW" ? "天" : "days"}
                                  </span>
                                  {transitionSaved && (
                                    <span className="text-emerald-500">
                                      <svg
                                        className="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth="2.5"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M4.5 12.75l6 6 9-13.5"
                                        />
                                      </svg>
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-gray-500 dark:text-gray-400">
                                    {locale === "zh-TW" ? "已使用" : "Used"}:{" "}
                                    <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                      {usedAnnualDays}
                                    </span>{" "}
                                    {locale === "zh-TW" ? "天" : "days"}
                                  </span>
                                  {remaining != null && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                      {locale === "zh-TW"
                                        ? "剩餘"
                                        : "Remaining"}
                                      :{" "}
                                      <span
                                        className={`font-semibold tabular-nums ${
                                          remaining < 0
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-gray-900 dark:text-gray-100"
                                        }`}
                                      >
                                        {remaining}
                                      </span>{" "}
                                      {locale === "zh-TW" ? "天" : "days"}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {remaining != null && remaining < 0 && (
                                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                                  {locale === "zh-TW"
                                    ? "已使用天數超過過渡期額度"
                                    : "Used days exceed transition quota"}
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Existing leaves table */}
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {locale === "zh-TW"
                                ? "已核准假單"
                                : "Approved Leaves"}
                            </h3>
                            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                              {leaves.length}
                            </span>
                          </div>
                          {leaves.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center dark:border-gray-700">
                              <p className="text-sm text-gray-400 dark:text-gray-500">
                                {locale === "zh-TW"
                                  ? "此週年期尚無已核准假單"
                                  : "No approved leaves in this period"}
                              </p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200 bg-gray-100/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                                    <th className="px-3 py-2.5">
                                      {locale === "zh-TW" ? "假別" : "Type"}
                                    </th>
                                    <th className="px-3 py-2.5">
                                      {locale === "zh-TW" ? "日期" : "Dates"}
                                    </th>
                                    <th className="px-3 py-2.5">
                                      {locale === "zh-TW" ? "天數" : "Days"}
                                    </th>
                                    <th className="px-3 py-2.5">
                                      {locale === "zh-TW" ? "備註" : "Notes"}
                                    </th>
                                    <th className="w-16 px-3 py-2.5" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                  {leaves.map((leave) => (
                                    <tr
                                      key={leave.id}
                                      className="text-gray-700 transition-colors hover:bg-gray-50/50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                                    >
                                      <td className="whitespace-nowrap px-3 py-2.5">
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-base leading-none">
                                            {getLeaveTypeEmoji(
                                              leave.leave_type as LeaveType,
                                            )}
                                          </span>
                                          {t(
                                            `leave.types.${leave.leave_type}` as `leave.types.${LeaveType}`,
                                          )}
                                        </span>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                                        {leave.start_date === leave.end_date
                                          ? leave.start_date
                                          : `${leave.start_date} ~ ${leave.end_date}`}
                                      </td>
                                      <td className="px-3 py-2.5 tabular-nums">
                                        {leave.days}
                                      </td>
                                      <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-400 dark:text-gray-500">
                                        {leave.notes || "—"}
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        <button
                                          onClick={() =>
                                            handleCancelLeave(leave.id)
                                          }
                                          className="rounded-md px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                                        >
                                          {locale === "zh-TW"
                                            ? "取消"
                                            : "Cancel"}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Formal annual leave section */}
                        {formalPeriod && (
                          <>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    {locale === "zh-TW"
                                      ? "正式年假"
                                      : "Formal Annual Leave"}
                                  </p>
                                  <p className="mt-0.5 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                                    {formalPeriod.periodStart} ~{" "}
                                    {formalPeriod.periodEnd}
                                  </p>
                                </div>
                                {(() => {
                                  const used = formalLeaves
                                    .filter((l) => l.leave_type === "annual")
                                    .reduce((sum, l) => sum + l.days, 0);
                                  const remaining = annualPolicyDays - used;
                                  return (
                                    <div className="flex items-center gap-3 text-sm">
                                      <span className="text-emerald-700 dark:text-emerald-300">
                                        {locale === "zh-TW" ? "額度" : "Quota"}:{" "}
                                        <span className="font-semibold tabular-nums">
                                          {annualPolicyDays}
                                        </span>
                                      </span>
                                      <span className="text-emerald-700 dark:text-emerald-300">
                                        {locale === "zh-TW"
                                          ? "已使用"
                                          : "Used"}
                                        :{" "}
                                        <span className="font-semibold tabular-nums">
                                          {used}
                                        </span>
                                      </span>
                                      <span
                                        className={
                                          remaining < 0
                                            ? "font-semibold text-red-600 dark:text-red-400"
                                            : "text-emerald-700 dark:text-emerald-300"
                                        }
                                      >
                                        {locale === "zh-TW"
                                          ? "剩餘"
                                          : "Remaining"}
                                        :{" "}
                                        <span className="font-semibold tabular-nums">
                                          {remaining}
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Formal period leaves table */}
                            <div>
                              <div className="mb-2 flex items-center gap-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {locale === "zh-TW"
                                    ? "正式年假假單"
                                    : "Formal Leave Records"}
                                </h3>
                                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                  {formalLeaves.length}
                                </span>
                              </div>
                              {formalLeaves.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center dark:border-gray-700">
                                  <p className="text-sm text-gray-400 dark:text-gray-500">
                                    {locale === "zh-TW"
                                      ? "此週年期尚無已核准假單"
                                      : "No approved leaves in this period"}
                                  </p>
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-200 bg-gray-100/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                                        <th className="px-3 py-2.5">
                                          {locale === "zh-TW" ? "假別" : "Type"}
                                        </th>
                                        <th className="px-3 py-2.5">
                                          {locale === "zh-TW"
                                            ? "日期"
                                            : "Dates"}
                                        </th>
                                        <th className="px-3 py-2.5">
                                          {locale === "zh-TW" ? "天數" : "Days"}
                                        </th>
                                        <th className="px-3 py-2.5">
                                          {locale === "zh-TW"
                                            ? "備註"
                                            : "Notes"}
                                        </th>
                                        <th className="w-16 px-3 py-2.5" />
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                      {formalLeaves.map((leave) => (
                                        <tr
                                          key={leave.id}
                                          className="text-gray-700 transition-colors hover:bg-gray-50/50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2.5">
                                            <span className="flex items-center gap-1.5">
                                              <span className="text-base leading-none">
                                                {getLeaveTypeEmoji(
                                                  leave.leave_type as LeaveType,
                                                )}
                                              </span>
                                              {t(
                                                `leave.types.${leave.leave_type}` as `leave.types.${LeaveType}`,
                                              )}
                                            </span>
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                                            {leave.start_date ===
                                            leave.end_date
                                              ? leave.start_date
                                              : `${leave.start_date} ~ ${leave.end_date}`}
                                          </td>
                                          <td className="px-3 py-2.5 tabular-nums">
                                            {leave.days}
                                          </td>
                                          <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-400 dark:text-gray-500">
                                            {leave.notes || "—"}
                                          </td>
                                          <td className="px-3 py-2.5 text-right">
                                            <button
                                              onClick={() =>
                                                handleCancelLeave(leave.id)
                                              }
                                              className="rounded-md px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                                            >
                                              {locale === "zh-TW"
                                                ? "取消"
                                                : "Cancel"}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Inline backfill form */}
                        <div>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {locale === "zh-TW"
                              ? "新增補登"
                              : "Add Backfill Entry"}
                          </h3>
                          <form
                            onSubmit={handleBackfill}
                            className="space-y-3"
                          >
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                  {locale === "zh-TW" ? "假別" : "Type"}
                                </label>
                                <select
                                  value={backfillForm.leave_type}
                                  onChange={(e) =>
                                    setBackfillForm((f) => ({
                                      ...f,
                                      leave_type: e.target.value as LeaveType,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-2 focus:ring-[#FF5C00]/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                  {LEAVE_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {t(
                                        `leave.types.${type}` as `leave.types.${LeaveType}`,
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                  {locale === "zh-TW" ? "起始日" : "Start"}
                                </label>
                                <input
                                  type="date"
                                  required
                                  min={period?.periodStart}
                                  max={formalPeriod?.periodEnd ?? period?.periodEnd}
                                  value={backfillForm.start_date}
                                  onChange={(e) =>
                                    setBackfillForm((f) => ({
                                      ...f,
                                      start_date: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-2 focus:ring-[#FF5C00]/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                  {locale === "zh-TW" ? "結束日" : "End"}
                                </label>
                                <input
                                  type="date"
                                  required
                                  min={
                                    backfillForm.start_date ||
                                    period?.periodStart
                                  }
                                  max={formalPeriod?.periodEnd ?? period?.periodEnd}
                                  value={backfillForm.end_date}
                                  onChange={(e) =>
                                    setBackfillForm((f) => ({
                                      ...f,
                                      end_date: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-2 focus:ring-[#FF5C00]/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                  {locale === "zh-TW" ? "備註" : "Notes"}
                                </label>
                                <input
                                  type="text"
                                  value={backfillForm.notes}
                                  onChange={(e) =>
                                    setBackfillForm((f) => ({
                                      ...f,
                                      notes: e.target.value,
                                    }))
                                  }
                                  placeholder={
                                    locale === "zh-TW"
                                      ? "選填"
                                      : "Optional"
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-2 focus:ring-[#FF5C00]/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="submit"
                                disabled={backfillLoading}
                                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                              >
                                {backfillLoading
                                  ? locale === "zh-TW"
                                    ? "建立中..."
                                    : "Adding..."
                                  : locale === "zh-TW"
                                    ? "補登"
                                    : "Add"}
                              </button>
                              {backfillSuccess && (
                                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                  {locale === "zh-TW" ? "已新增" : "Added"}
                                </span>
                              )}
                            </div>
                          </form>
                          {backfillError && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                              {backfillError}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
