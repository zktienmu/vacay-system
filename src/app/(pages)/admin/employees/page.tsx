"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useSession } from "@/hooks/useSession";
import { useEmployees } from "@/hooks/useEmployees";
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

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual",
  personal: "Personal",
  sick: "Sick",
  official: "Official",
  unpaid: "Unpaid",
  remote: "Remote",
};

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

  // Add employee modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    wallet_address: "",
    role: "employee" as "admin" | "employee",
    start_date: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">
            You do not have permission to access this page.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-blue-500 hover:text-blue-600"
          >
            Go to Dashboard
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
        start_date: "",
      });
      refetch();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddLoading(false);
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
      alert("Policies saved successfully");
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
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500">
            Manage employees and their leave policies.
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
          Add Employee
        </button>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No employees found. Add your first employee to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {/* Row */}
              <button
                onClick={() => toggleExpand(emp.id)}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {emp.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {truncateAddress(emp.wallet_address)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      emp.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {emp.role}
                  </span>
                  <span className="hidden text-sm text-gray-500 sm:inline">
                    Since {format(new Date(emp.start_date), "MMM yyyy")}
                  </span>
                  <svg
                    className={`h-5 w-5 text-gray-400 transition-transform ${
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
                </div>
              </button>

              {/* Expanded policies */}
              {expandedId === emp.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                  {policiesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-6 w-6 animate-spin rounded-full border-3 border-gray-200 border-t-blue-500" />
                    </div>
                  ) : (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">
                        Leave Policies
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {LEAVE_TYPES.map((type) => (
                          <div key={type} className="flex items-center gap-2">
                            <label className="w-20 text-sm text-gray-600">
                              {LEAVE_TYPE_LABELS[type]}
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
                              className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">days</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => savePolicies(emp.id)}
                          disabled={policySaving}
                          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                        >
                          {policySaving ? "Saving..." : "Save Policies"}
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
                <DialogPanel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <DialogTitle className="text-lg font-bold text-gray-900">
                    Add Employee
                  </DialogTitle>

                  <form
                    onSubmit={handleAddEmployee}
                    className="mt-4 space-y-4"
                  >
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Name
                      </label>
                      <input
                        type="text"
                        required
                        value={addForm.name}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Wallet Address
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
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                        placeholder="0x..."
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Role
                      </label>
                      <select
                        value={addForm.role}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            role: e.target.value as "admin" | "employee",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                      >
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Start Date
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
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                      />
                    </div>

                    {addError && (
                      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                        {addError}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={addLoading}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                      >
                        {addLoading ? "Adding..." : "Add Employee"}
                      </button>
                    </div>
                  </form>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
