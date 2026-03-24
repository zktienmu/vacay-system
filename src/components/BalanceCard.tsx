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
  const {
    leave_type,
    total_days,
    used_days,
    remaining_days,
    transition_days,
    transition_used_days,
  } = balance;

  const hasTransition = transition_days != null && transition_used_days != null;
  const transitionRemaining = hasTransition
    ? transition_days - transition_used_days
    : 0;
  const totalRemaining = remaining_days + transitionRemaining;

  const totalAll = hasTransition ? total_days + transition_days : total_days;
  const usedAll = hasTransition ? used_days + transition_used_days : used_days;
  const percentage = totalAll > 0 ? (usedAll / totalAll) * 100 : 0;

  const isUnlimited = total_days === -1;
  const emoji = getLeaveTypeEmoji(leave_type);
  const label = t(`leave.types.${leave_type}` as `leave.types.${LeaveType}`);
  const barColor = getProgressColor(usedAll, totalAll);

  // 無限制假別：大字顯示已使用天數，不顯示進度條
  if (isUnlimited) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {label}
          </h3>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
            {used_days}
          </span>
          <span className="text-base font-medium text-gray-400 dark:text-gray-500">
            {locale === "zh-TW" ? "天" : `day${used_days !== 1 ? "s" : ""}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {locale === "zh-TW"
            ? "已經使用，無天數限制"
            : "used, no limit"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {label}
          </h3>
        </div>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {totalRemaining}
        </span>
      </div>

      {hasTransition ? (
        <div className="mb-2 space-y-0.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {locale === "zh-TW"
              ? `正式週期：已用 ${used_days} / 共 ${total_days} 天`
              : `Formal: ${used_days} used / ${total_days} total`}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {locale === "zh-TW"
              ? `過渡期：已用 ${transition_used_days} / 共 ${transition_days} 天`
              : `Transition: ${transition_used_days} used / ${transition_days} total`}
          </p>
        </div>
      ) : (
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {locale === "zh-TW"
            ? `已使用 ${used_days} / 共 ${total_days} 天`
            : `${used_days} used / ${total_days} total`}
        </p>
      )}

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
        {locale === "zh-TW"
          ? `剩餘 ${totalRemaining} 天`
          : `${totalRemaining} day${totalRemaining !== 1 ? "s" : ""} remaining`}
      </p>
    </div>
  );
}
