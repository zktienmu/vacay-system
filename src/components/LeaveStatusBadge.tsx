"use client";

import type { LeaveStatus } from "@/types";
import { useTranslation } from "@/lib/i18n/context";

const statusConfig: Record<
  LeaveStatus,
  { className: string }
> = {
  pending: {
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  },
  approved: {
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  },
  rejected: {
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  },
  cancelled: {
    className: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600",
  },
};

export default function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  const label = t(`leave.status.${status}` as `leave.status.${LeaveStatus}`);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {label}
    </span>
  );
}
