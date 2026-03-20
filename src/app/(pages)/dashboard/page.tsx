"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSession } from "@/hooks/useSession";
import { useLeaveBalance } from "@/hooks/useLeaveBalance";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import BalanceCard from "@/components/BalanceCard";
import LeaveStatusBadge from "@/components/LeaveStatusBadge";
import LeaveTypeIcon from "@/components/LeaveTypeIcon";
import type { LeaveRequest, ApiResponse } from "@/types";

interface DelegatedLeave extends LeaveRequest {
  employee: { id: string; name: string } | null;
}

export default function DashboardPage() {
  const { session } = useSession();
  const { balances, isLoading: balancesLoading } = useLeaveBalance();
  const { requests, isLoading: requestsLoading } = useLeaveRequests();
  const [delegatedLeaves, setDelegatedLeaves] = useState<DelegatedLeave[]>([]);
  const [delegatedLoading, setDelegatedLoading] = useState(true);

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

  const recentRequests = requests.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {session?.name || "User"}
          </h1>
          <p className="text-gray-500">
            Here is an overview of your leave balances and recent requests.
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
          New Leave Request
        </Link>
      </div>

      {/* Balance cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Leave Balances
        </h2>
        {balancesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : balances.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No leave balances found. Contact your admin to set up your leave
            policies.
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
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Delegated To Me
        </h2>
        {delegatedLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : delegatedLeaves.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No one has delegated work to you right now.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Requester</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Dates</th>
                    <th className="px-6 py-3">Days</th>
                    <th className="px-6 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {delegatedLeaves.map((leave) => (
                    <tr key={leave.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {leave.employee?.name || "Unknown"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={leave.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {format(new Date(leave.start_date), "MMM d")} -{" "}
                        {format(new Date(leave.end_date), "MMM d, yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {leave.days} day{leave.days !== 1 ? "s" : ""}
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500">
                        {leave.notes || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-gray-100 md:hidden">
              {delegatedLeaves.map((leave) => (
                <div key={leave.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {leave.employee?.name || "Unknown"}
                    </span>
                    <LeaveTypeIcon type={leave.leave_type} showLabel />
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {format(new Date(leave.start_date), "MMM d")} -{" "}
                    {format(new Date(leave.end_date), "MMM d, yyyy")} ({leave.days}{" "}
                    day{leave.days !== 1 ? "s" : ""})
                  </div>
                  {leave.notes && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {leave.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recent requests */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Requests
          </h2>
        </div>
        {requestsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : recentRequests.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No leave requests yet.{" "}
            <Link
              href="/leave/new"
              className="text-blue-500 underline hover:text-blue-600"
            >
              Create your first one
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Dates</th>
                    <th className="px-6 py-3">Days</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveTypeIcon type={req.leave_type} showLabel />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {format(new Date(req.start_date), "MMM d")} -{" "}
                        {format(new Date(req.end_date), "MMM d, yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {req.days} day{req.days !== 1 ? "s" : ""}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <LeaveStatusBadge status={req.status} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {format(new Date(req.created_at), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 md:hidden">
              {recentRequests.map((req) => (
                <div key={req.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <LeaveTypeIcon type={req.leave_type} showLabel />
                    <LeaveStatusBadge status={req.status} />
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {format(new Date(req.start_date), "MMM d")} -{" "}
                    {format(new Date(req.end_date), "MMM d, yyyy")} ({req.days}{" "}
                    day{req.days !== 1 ? "s" : ""})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
