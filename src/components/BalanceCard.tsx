"use client";

import type { LeaveBalance } from "@/types";
import { getLeaveTypeEmoji } from "./LeaveTypeIcon";
import { useTranslation } from "@/lib/i18n/context";
import type { LeaveType } from "@/types";

function getProgressColor(used: number, total: number): string {
  if (total === 0) return "bg-gray-300 dark:bg-gray-600";
  const ratio = used / total;
  if (ratio < 0.5) return "bg-green-500";
  if (ratio < 0.8) return "bg-yellow-500";
  return "bg-red-500";
}

export default function BalanceCard({ balance }: { balance: LeaveBalance }) {
  const { t, locale } = useTranslation();
  const { leave_type, total_days, used_days, remaining_days } = balance;
  const percentage = total_days > 0 ? (used_days / total_days) * 100 : 0;
  const emoji = getLeaveTypeEmoji(leave_type);
  const label = t(`leave.types.${leave_type}` as `leave.types.${LeaveType}`);
  const barColor = getProgressColor(used_days, total_days);

  const usedTotalText = locale === "zh-TW"
    ? `已使用 ${used_days} / 共 ${total_days} 天`
    : `${used_days} used / ${total_days} total`;

  const remainingText = locale === "zh-TW"
    ? `剩餘 ${remaining_days} 天`
    : `${remaining_days} day${remaining_days !== 1 ? "s" : ""} remaining`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        </div>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {remaining_days}
        </span>
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {usedTotalText}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
        {remainingText}
      </p>
    </div>
  );
}
