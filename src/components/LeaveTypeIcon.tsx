"use client";

import type { LeaveType } from "@/types";

const leaveTypeConfig: Record<
  LeaveType,
  { emoji: string; label: string; color: string }
> = {
  annual: { emoji: "\uD83C\uDF34", label: "Annual", color: "text-blue-600" },
  personal: { emoji: "\uD83D\uDC64", label: "Personal", color: "text-purple-600" },
  sick: { emoji: "\uD83C\uDFE5", label: "Sick", color: "text-red-600" },
  official: { emoji: "\uD83D\uDCBC", label: "Official", color: "text-teal-600" },
  unpaid: { emoji: "\uD83D\uDCCB", label: "Unpaid", color: "text-gray-600" },
  remote: { emoji: "\uD83C\uDFE0", label: "Remote", color: "text-green-600" },
};

export function getLeaveTypeEmoji(type: LeaveType): string {
  return leaveTypeConfig[type].emoji;
}

export function getLeaveTypeLabel(type: LeaveType): string {
  return leaveTypeConfig[type].label;
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
  const config = leaveTypeConfig[type];
  return (
    <span className={`inline-flex items-center gap-1 ${config.color}`}>
      <span>{config.emoji}</span>
      {showLabel && <span className="text-sm font-medium">{config.label}</span>}
    </span>
  );
}
