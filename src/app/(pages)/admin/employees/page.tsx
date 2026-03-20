"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW as zhTWLocale } from "date-fns/locale/zh-TW";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useSession } from "@/hooks/useSession";
import { useEmployees } from "@/hooks/useEmployees";
import { useTranslation } from "@/lib/i18n/context";
import type {
  Employee,
  LeavePolicy,
  LeaveType,
  ApiResponse,
} from "@/types";

const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "official",
  "unpaid",
  "remote",
];

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface PolicyFormData {
  [key: string]: number;
}

export default function EmployeesPage() {
  const { session } = useSession();
  const { employees, isLoading, refetch } = useEmployees();
  const { t, locale } = useTranslation();

  const dateFnsLocale = locale === "zh-TW" ? zhTWLocale : undefined;

  // Add employee modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    wallet_address: "",
    role: "employee" as "admin" | "employee",
    department: "engineering" as "engineering" | "admin",
    is_manager: false,
    start_date: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit employee modal
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    wallet_address: "",
    slack_user_id: "",
    role: "employee" as "admin" | "employee",
    department: "engineering" as "engineering" | "admin",
    is_manager: false,
    start_date: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Expanded employee for policy editing
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [policyForm, setPolicyForm] = useState<PolicyFormData>({});
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);

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

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to add employee");
      }
      setShowAddModal(false);
      setAddForm({
        name: "",
        wallet_address: "",
        role: "employee",
        department: "engineering",
        is_manager: false,
        start_date: "",
      });
      refetch();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddLoading(false);
    }
  }

  function openEditModal(emp: Employee) {
    setEditEmployee(emp);
    setEditForm({
      name: emp.name,
      wallet_address: emp.wallet_address,
      slack_user_id: emp.slack_user_id ?? "",
      role: emp.role,
      department: emp.department,
      is_manager: emp.is_manager,
      start_date: emp.start_date,
    });
    setEditError(null);
  }

  async function handleEditEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmployee) return;
    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/employees/${editEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          slack_user_id: editForm.slack_user_id || null,
        }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to update employee");
      }
      setEditEmployee(null);
      refetch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/employees/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to delete employee");
      }
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete employee");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function toggleExpand(employeeId: string) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(employeeId);
    setPoliciesLoading(true);

    try {
      const res = await fetch(`/api/employees/${employeeId}/policies`);
      const json: ApiResponse<LeavePolicy[]> = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || "Failed to fetch policies");
      }
      setPolicies(json.data);

      const form: PolicyFormData = {};
      for (const type of LEAVE_TYPES) {
        const policy = json.data.find((p) => p.leave_type === type);
        form[type] = policy?.total_days ?? 0;
      }
      setPolicyForm(form);
    } catch (err) {
      console.error("Failed to fetch policies:", err);
      const form: PolicyFormData = {};
      for (const type of LEAVE_TYPES) {
        form[type] = 0;
      }
      setPolicyForm(form);
      setPolicies([]);
    } finally {
      setPoliciesLoading(false);
    }
  }

  async function savePolicies(employeeId: string) {
    setPolicySaving(true);
    try {
      const policiesPayload = LEAVE_TYPES.map((type) => ({
        leave_type: type,
        total_days: policyForm[type] ?? 0,
      }));

      const res = await fetch(`/api/employees/${employeeId}/policies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: policiesPayload }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to save policies");
      }
      alert(t("employees.policiesSaved"));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save policies");
    } finally {
      setPolicySaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("employees.title")}</h1>
          <p className="text-gray-500 dark:text-gray-400">
            {t("employees.description")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
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
          {t("employees.addEmployee")}
        </button>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          {t("employees.noEmployees")}
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Row */}
              <div className="flex w-full items-center justify-between px-6 py-4">
                <button
                  onClick={() => toggleExpand(emp.id)}
                  className="flex flex-1 items-center gap-4 text-left transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {emp.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {truncateAddress(emp.wallet_address)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      emp.role === "admin"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    }`}
                  >
                    {emp.role}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    {emp.department === "admin"
                      ? (locale === "zh-TW" ? "行政" : "Admin")
                      : (locale === "zh-TW" ? "工程" : "Engineering")}
                  </span>
                  {emp.is_manager && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {locale === "zh-TW" ? "主管" : "Manager"}
                    </span>
                  )}
                  <span className="hidden text-sm text-gray-500 sm:inline dark:text-gray-400">
                    {t("employees.since")} {format(new Date(emp.start_date), "MMM yyyy", { locale: dateFnsLocale })}
                  </span>
                  {/* Edit button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(emp); }}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                    title={locale === "zh-TW" ? "編輯" : "Edit"}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(emp); }}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    title={locale === "zh-TW" ? "刪除" : "Delete"}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                  {/* Expand chevron */}
                  <button
                    onClick={() => toggleExpand(emp.id)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-700"
                  >
                    <svg
                      className={`h-5 w-5 transition-transform ${
                        expandedId === emp.id ? "rotate-180" : ""
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
                </div>
              </div>

              {/* Expanded policies */}
              {expandedId === emp.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/50">
                  {policiesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-6 w-6 animate-spin rounded-full border-3 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
                    </div>
                  ) : (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t("employees.leavePolicies")}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {LEAVE_TYPES.map((type) => (
                          <div key={type} className="flex items-center gap-2">
                            <label className="w-20 text-sm text-gray-600 dark:text-gray-400">
                              {t(`leave.types.${type}` as `leave.types.${LeaveType}`)}
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={policyForm[type] ?? 0}
                              onChange={(e) =>
                                setPolicyForm((prev) => ({
                                  ...prev,
                                  [type]: parseInt(e.target.value) || 0,
                                }))
                              }
                              className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                            />
                            <span className="text-xs text-gray-400 dark:text-gray-500">{t("employees.daysLabel")}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => savePolicies(emp.id)}
                          disabled={policySaving}
                          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                        >
                          {policySaving ? t("employees.saving") : t("employees.savePolicies")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      <Transition show={showAddModal} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setShowAddModal(false)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
                  <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {t("employees.addEmployeeTitle")}
                  </DialogTitle>

                  <form
                    onSubmit={handleAddEmployee}
                    className="mt-4 space-y-4"
                  >
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.name")}
                      </label>
                      <input
                        type="text"
                        required
                        value={addForm.name}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        placeholder={t("employees.namePlaceholder")}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.walletAddress")}
                      </label>
                      <input
                        type="text"
                        required
                        value={addForm.wallet_address}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            wallet_address: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="0x..."
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.role")}
                      </label>
                      <select
                        value={addForm.role}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            role: e.target.value as "admin" | "employee",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="employee">{t("employees.roleEmployee")}</option>
                        <option value="admin">{t("employees.roleAdmin")}</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {locale === "zh-TW" ? "部門" : "Department"}
                      </label>
                      <select
                        value={addForm.department}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            department: e.target.value as "engineering" | "admin",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="engineering">{locale === "zh-TW" ? "工程" : "Engineering"}</option>
                        <option value="admin">{locale === "zh-TW" ? "行政" : "Admin"}</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_manager"
                        checked={addForm.is_manager}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            is_manager: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <label htmlFor="is_manager" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {locale === "zh-TW" ? "部門主管" : "Department Manager"}
                      </label>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.startDate")}
                      </label>
                      <input
                        type="date"
                        required
                        value={addForm.start_date}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            start_date: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    {addError && (
                      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                        {addError}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={addLoading}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                      >
                        {addLoading ? t("employees.adding") : t("employees.addEmployee")}
                      </button>
                    </div>
                  </form>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Edit Employee Modal */}
      <Transition show={editEmployee !== null} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setEditEmployee(null)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
                  <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {locale === "zh-TW" ? "編輯員工" : "Edit Employee"}
                  </DialogTitle>

                  <form
                    onSubmit={handleEditEmployee}
                    className="mt-4 space-y-4"
                  >
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.name")}
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.walletAddress")}
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.wallet_address}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            wallet_address: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Slack User ID
                      </label>
                      <input
                        type="text"
                        value={editForm.slack_user_id}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            slack_user_id: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="U0XXXXXXXX"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.role")}
                      </label>
                      <select
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            role: e.target.value as "admin" | "employee",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="employee">{t("employees.roleEmployee")}</option>
                        <option value="admin">{t("employees.roleAdmin")}</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {locale === "zh-TW" ? "部門" : "Department"}
                      </label>
                      <select
                        value={editForm.department}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            department: e.target.value as "engineering" | "admin",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="engineering">{locale === "zh-TW" ? "工程" : "Engineering"}</option>
                        <option value="admin">{locale === "zh-TW" ? "行政" : "Admin"}</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit_is_manager"
                        checked={editForm.is_manager}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            is_manager: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <label htmlFor="edit_is_manager" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {locale === "zh-TW" ? "部門主管" : "Department Manager"}
                      </label>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("employees.startDate")}
                      </label>
                      <input
                        type="date"
                        required
                        value={editForm.start_date}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            start_date: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    {editError && (
                      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                        {editError}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditEmployee(null)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                      >
                        {editLoading
                          ? (locale === "zh-TW" ? "儲存中..." : "Saving...")
                          : (locale === "zh-TW" ? "儲存" : "Save")}
                      </button>
                    </div>
                  </form>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Delete Confirmation Dialog */}
      <Transition show={deleteTarget !== null} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setDeleteTarget(null)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
                  <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {locale === "zh-TW" ? "確認刪除" : "Confirm Delete"}
                  </DialogTitle>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {locale === "zh-TW"
                      ? `確定要刪除員工「${deleteTarget?.name}」嗎？此操作無法復原。`
                      : `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
                  </p>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteEmployee}
                      disabled={deleteLoading}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteLoading
                        ? (locale === "zh-TW" ? "刪除中..." : "Deleting...")
                        : (locale === "zh-TW" ? "刪除" : "Delete")}
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
