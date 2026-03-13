"use client";

import type { LeaveBalance } from "@/types";
import { getLeaveTypeEmoji, getLeaveTypeLabel } from "./LeaveTypeIcon";

function getProgressColor(used: number, total: number): string {
  if (total === 0) return "bg-gray-300";
  const ratio = used / total;
  if (ratio < 0.5) return "bg-green-500";
  if (ratio < 0.8) return "bg-yellow-500";
  return "bg-red-500";
}

export default function BalanceCard({ balance }: { balance: LeaveBalance }) {
  const { leave_type, total_days, used_days, remaining_days } = balance;
  const percentage = total_days > 0 ? (used_days / total_days) * 100 : 0;
  const emoji = getLeaveTypeEmoji(leave_type);
  const label = getLeaveTypeLabel(leave_type);
  const barColor = getProgressColor(used_days, total_days);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        </div>
        <span className="text-2xl font-bold text-gray-900">
          {remaining_days}
        </span>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        {used_days} used / {total_days} total
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-right text-xs font-medium text-gray-500">
        {remaining_days} day{remaining_days !== 1 ? "s" : ""} remaining
      </p>
    </div>
  );
}
