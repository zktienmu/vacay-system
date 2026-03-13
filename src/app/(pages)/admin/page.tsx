"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSession } from "@/hooks/useSession";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import type { ApiResponse } from "@/types";

export default function AdminReviewPage() {
  const { session } = useSession();
  const { requests, isLoading, refetch } = useLeaveRequests(true);

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

  async function handleAction(id: string, status: "approved" | "rejected") {
    const confirmMsg =
      status === "approved"
        ? "Are you sure you want to approve this leave request?"
        : "Are you sure you want to reject this leave request?";

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json: ApiResponse = await res.json();
      if (!json.success) {
        alert(json.error || "Failed to update request");
        return;
      }
      refetch();
    } catch {
      alert("Failed to update request");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Review Leave Requests
        </h1>
        <p className="text-gray-500">
          Approve or reject pending leave requests from your team.
        </p>
      </div>

      {/* Pending requests */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Pending Requests ({pendingRequests.length})
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No pending requests. All caught up!
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Dates</th>
                    <th className="px-6 py-3">Days</th>
                    <th className="px-6 py-3">Notes</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        <Link
                          href={`/admin/review/${req.id}`}
                          className="hover:text-blue-600"
                        >
                          {req.employee?.name || "Unknown"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {format(new Date(req.start_date), "MMM d")} -{" "}
                        {format(new Date(req.end_date), "MMM d, yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {req.days}
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500">
                        {req.notes || "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction(req.id, "approved")}
                            className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(req.id, "rejected")}
                            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
                          >
                            Reject
                          </button>
                          <Link
                            href={`/admin/review/${req.id}`}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 lg:hidden">
              {pendingRequests.map((req) => (
                <div key={req.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/admin/review/${req.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600"
                    >
                      {req.employee?.name || "Unknown"}
                    </Link>
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {format(new Date(req.start_date), "MMM d")} -{" "}
                    {format(new Date(req.end_date), "MMM d, yyyy")} ({req.days}{" "}
                    day{req.days !== 1 ? "s" : ""})
                  </div>
                  {req.notes && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-1">
                      {req.notes}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => handleAction(req.id, "approved")}
                      className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(req.id, "rejected")}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
                    >
                      Reject
                    </button>
                    <Link
                      href={`/admin/review/${req.id}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recently reviewed */}
      {recentReviewed.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recently Reviewed
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Dates</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentReviewed.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {req.employee?.name || "Unknown"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {format(new Date(req.start_date), "MMM d")} -{" "}
                        {format(new Date(req.end_date), "MMM d, yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveStatusBadge status={req.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-gray-100 md:hidden">
              {recentReviewed.map((req) => (
                <div key={req.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {req.employee?.name || "Unknown"}
                    </span>
                    <LeaveStatusBadge status={req.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                    <span className="text-sm text-gray-600">
                      {format(new Date(req.start_date), "MMM d")} -{" "}
                      {format(new Date(req.end_date), "MMM d")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
