"use client";

import type { LeaveType } from "@/types";
import { useTranslation } from "@/lib/i18n/context";

const leaveTypeConfig: Record<
  LeaveType,
  { emoji: string; color: string }
> = {
  annual: { emoji: "\uD83C\uDF34", color: "text-blue-600 dark:text-blue-400" },
  personal: { emoji: "\uD83D\uDC64", color: "text-purple-600 dark:text-purple-400" },
  sick: { emoji: "\uD83C\uDFE5", color: "text-red-600 dark:text-red-400" },
  unpaid: { emoji: "\uD83D\uDCCB", color: "text-gray-600 dark:text-gray-400" },
  remote: { emoji: "\uD83C\uDFE0", color: "text-green-600 dark:text-green-400" },
  family_care: { emoji: "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", color: "text-amber-600 dark:text-amber-400" },
  menstrual: { emoji: "\uD83E\uDE78", color: "text-pink-600 dark:text-pink-400" },
};

export function getLeaveTypeEmoji(type: LeaveType): string {
  return leaveTypeConfig[type].emoji;
}

export function getLeaveTypeLabel(type: LeaveType): string {
  // Fallback label for non-component usage (e.g. calendar event titles)
  const labels: Record<LeaveType, string> = {
    annual: "Annual",
    personal: "Personal",
    sick: "Sick",
    unpaid: "Unpaid",
    remote: "Remote",
    family_care: "Family Care",
    menstrual: "Menstrual",
  };
  return labels[type];
}

export function getLeaveTypeColor(type: LeaveType): string {
  return leaveTypeConfig[type].color;
}

export default function LeaveTypeIcon({
  type,
  showLabel = false,
}: {
  type: LeaveType;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  const config = leaveTypeConfig[type];
  const label = t(`leave.types.${type}` as `leave.types.${LeaveType}`);
  return (
    <span className={`inline-flex items-center gap-1 ${config.color}`}>
      <span>{config.emoji}</span>
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </span>
  );
}
