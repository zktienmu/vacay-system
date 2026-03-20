"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSession } from "@/hooks/useSession";
import type { PublicHoliday, ApiResponse } from "@/types";

export default function HolidaysPage() {
  const { session } = useSession();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    date: "",
    name: "",
    description: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  async function fetchHolidays() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/holidays?year=${yearFilter}`);
      const json: ApiResponse<PublicHoliday[]> = await res.json();
      if (json.success && json.data) {
        setHolidays(json.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchHolidays();
  }, [yearFilter]);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);

    try {
      const year = new Date(addForm.date).getFullYear();
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: addForm.date,
          name: addForm.name,
          description: addForm.description || null,
          year,
        }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to add holiday");
      }
      setShowAdd(false);
      setAddForm({ date: "", name: "", description: "" });
      fetchHolidays();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this holiday?")) return;

    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        alert(json.error || "Failed to delete holiday");
        return;
      }
      fetchHolidays();
    } catch {
      alert("Failed to delete holiday");
    } finally {
      setDeleteLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Public Holidays</h1>
          <p className="text-gray-500">
            Manage public holidays that are excluded from leave calculations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAdd(!showAdd)}
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
            Add Holiday
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Add New Holiday
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Date
              </label>
              <input
                type="date"
                required
                value={addForm.date}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, date: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
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
                placeholder="Holiday name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                value={addForm.description}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional description"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
          </div>

          {addError && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {addError}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {addLoading ? "Adding..." : "Add Holiday"}
            </button>
          </div>
        </form>
      )}

      {/* Holiday list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      ) : holidays.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No public holidays found for {yearFilter}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Name</th>
                <th className="hidden px-6 py-3 sm:table-cell">Description</th>
                <th className="px-6 py-3">Year</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays.map((holiday) => (
                <tr key={holiday.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {format(new Date(holiday.date), "MMM d, yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {holiday.name}
                  </td>
                  <td className="hidden max-w-xs truncate px-6 py-4 text-sm text-gray-500 sm:table-cell">
                    {holiday.description || "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {holiday.year}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={() => handleDelete(holiday.id)}
                      disabled={deleteLoading === holiday.id}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                    >
                      {deleteLoading === holiday.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
