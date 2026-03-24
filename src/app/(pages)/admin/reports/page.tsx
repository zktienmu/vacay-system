"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSession } from "@/hooks/useSession";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useEmployees } from "@/hooks/useEmployees";
import { useTranslation } from "@/lib/i18n/context";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";

export default function AdminReportsPage() {
  const { session } = useSession();
  const { t } = useTranslation();
  const { requests, isLoading: requestsLoading } = useLeaveRequests(true);
  const { employees, isLoading: employeesLoading } = useEmployees();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  const isLoading = requestsLoading || employeesLoading;

  const statusOptions = useMemo(
    () => [
      { value: "", label: t("reports.allStatuses") },
      { value: "pending", label: t("leave.status.pending") },
      { value: "approved", label: t("leave.status.approved") },
      { value: "rejected", label: t("leave.status.rejected") },
      { value: "cancelled", label: t("leave.status.cancelled") },
    ],
    [t],
  );

  // Build an employee id->name map for display
  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees],
  );

  // Filter requests based on selected filters
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (selectedEmployeeId && r.employee_id !== selectedEmployeeId)
        return false;
      if (selectedStatus && r.status !== selectedStatus) return false;
      if (fromDate && r.start_date < fromDate) return false;
      if (toDate && r.end_date > toDate) return false;
      return true;
    });
  }, [requests, selectedEmployeeId, selectedStatus, fromDate, toDate]);

  const buildLeaveExportUrl = useCallback(
    (fmt: "csv" | "pdf") => {
      const params = new URLSearchParams({ format: fmt });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (selectedEmployeeId) params.set("employee_id", selectedEmployeeId);
      if (selectedStatus) params.set("status", selectedStatus);
      return `/api/reports/leave?${params.toString()}`;
    },
    [fromDate, toDate, selectedEmployeeId, selectedStatus],
  );

  const handleExport = useCallback(
    async (url: string, filename: string) => {
      setExporting(filename);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          alert(json?.error || "Export failed");
          return;
        }
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      } catch {
        alert("Export failed");
      } finally {
        setExporting(null);
      }
    },
    [],
  );

  if (session?.role !== "admin" && !session?.is_manager) {
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
            className="mt-4 inline-block text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t("common.goToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("reports.title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t("reports.description")}
        </p>
      </div>

      {/* Leave Report Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("reports.leaveReport")}
        </h2>

        {/* Filters */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("reports.from")}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("reports.to")}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("reports.employee")}
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">{t("reports.allEmployees")}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("reports.status")}
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() =>
                handleExport(
                  buildLeaveExportUrl("csv"),
                  "leave-report.csv",
                )
              }
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              <DownloadIcon />
              {exporting === "leave-report.csv"
                ? t("reports.exporting")
                : t("reports.exportCsv")}
            </button>
            <button
              onClick={() =>
                handleExport(
                  buildLeaveExportUrl("pdf"),
                  "leave-report.pdf",
                )
              }
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
            >
              <DownloadIcon />
              {exporting === "leave-report.pdf"
                ? t("reports.exporting")
                : t("reports.exportPdf")}
            </button>
          </div>
        </div>

        {/* Preview Table */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-6 py-3 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("reports.preview")} ({filteredRequests.length} {t("reports.records")})
            </h3>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
                />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {t("reports.noResults")}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                      <th className="px-6 py-3">{t("reports.employee")}</th>
                      <th className="px-6 py-3">{t("reports.type")}</th>
                      <th className="px-6 py-3">{t("reports.start")}</th>
                      <th className="px-6 py-3">{t("reports.end")}</th>
                      <th className="px-6 py-3">{t("reports.days")}</th>
                      <th className="px-6 py-3">{t("reports.status")}</th>
                      <th className="px-6 py-3">{locale === "zh-TW" ? "決定者" : "Decided by"}</th>
                      <th className="px-6 py-3">{t("reports.delegate")}</th>
                      <th className="px-6 py-3">{t("reports.notes")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredRequests.slice(0, 50).map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {req.employee?.name ??
                            employeeMap.get(req.employee_id) ??
                            t("common.unknown")}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <LeaveTypeIcon type={req.leave_type} showLabel />
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {format(new Date(req.start_date), "yyyy/MM/dd")}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {format(new Date(req.end_date), "yyyy/MM/dd")}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {req.days}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <LeaveStatusBadge status={req.status} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {req.reviewed_by
                            ? (req.reviewer?.name ?? employeeMap.get(req.reviewed_by) ?? "-")
                            : "-"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {req.delegate_id
                            ? (req.delegate?.name ??
                              employeeMap.get(req.delegate_id) ??
                              "-")
                            : "-"}
                        </td>
                        <td className="max-w-xs truncate px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {req.notes || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRequests.length > 50 && (
                  <div className="border-t border-gray-100 px-6 py-3 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t("reports.showingFirst")} 50 {t("reports.of")} {filteredRequests.length} {t("reports.exportToSeeAll")}
                  </div>
                )}
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-700">
                {filteredRequests.slice(0, 20).map((req) => (
                  <div key={req.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {req.employee?.name ??
                          employeeMap.get(req.employee_id) ??
                          t("common.unknown")}
                      </span>
                      <LeaveStatusBadge status={req.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <LeaveTypeIcon type={req.leave_type} showLabel />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {format(new Date(req.start_date), "yyyy/MM/dd")} -{" "}
                        {format(new Date(req.end_date), "yyyy/MM/dd")} ({req.days}d)
                      </span>
                    </div>
                  </div>
                ))}
                {filteredRequests.length > 20 && (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("reports.showingFirst")} 20 {t("reports.of")} {filteredRequests.length} {t("reports.records")}.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Balance Report Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("reports.balanceReport")}
        </h2>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {t("reports.balanceReportDesc")}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                handleExport(
                  "/api/reports/balance?format=csv",
                  "balance-report.csv",
                )
              }
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              <DownloadIcon />
              {exporting === "balance-report.csv"
                ? t("reports.exporting")
                : t("reports.exportCsv")}
            </button>
            <button
              onClick={() =>
                handleExport(
                  "/api/reports/balance?format=pdf",
                  "balance-report.pdf",
                )
              }
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
            >
              <DownloadIcon />
              {exporting === "balance-report.pdf"
                ? t("reports.exporting")
                : t("reports.exportPdf")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DownloadIcon() {
  return (
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}
