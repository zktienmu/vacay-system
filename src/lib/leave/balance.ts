import { LeaveType, LeaveBalance } from "@/types";
import {
  getLeavePolicies,
  getApprovedDaysInPeriod,
  getPublicHolidayDatesInRange,
} from "@/lib/supabase/queries";

export function calculateAnniversaryPeriod(
  startDate: string,
  referenceDate?: string,
): { periodStart: string; periodEnd: string } {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const start = new Date(startDate);

  // Find the most recent anniversary date on or before the reference date
  let anniversaryYear = ref.getFullYear();
  const anniversaryThisYear = new Date(
    anniversaryYear,
    start.getMonth(),
    start.getDate(),
  );

  if (anniversaryThisYear > ref) {
    anniversaryYear -= 1;
  }

  const periodStart = new Date(
    anniversaryYear,
    start.getMonth(),
    start.getDate(),
  );
  const periodEnd = new Date(
    anniversaryYear + 1,
    start.getMonth(),
    start.getDate() - 1,
  );

  return {
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(periodEnd),
  };
}

export function calculateWorkingDays(
  startDate: string,
  endDate: string,
  holidayDates?: Set<string>,
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) return 0;

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    // Monday=1, Tuesday=2, ..., Friday=5. Exclude Saturday=6 and Sunday=0.
    if (day !== 0 && day !== 6) {
      // Also exclude public holidays
      if (!holidayDates || !holidayDates.has(formatDate(current))) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export async function calculateWorkingDaysExcludingHolidays(
  startDate: string,
  endDate: string,
): Promise<number> {
  const holidayDateStrings = await getPublicHolidayDatesInRange(startDate, endDate);
  const holidayDates = new Set(holidayDateStrings);
  return calculateWorkingDays(startDate, endDate, holidayDates);
}

// Transition period: from 2026/01/01 to the day before the next employment anniversary
export function calculateTransitionPeriod(
  startDate: string,
): { periodStart: string; periodEnd: string } {
  const start = new Date(startDate);
  let nextYear = 2026;
  let nextAnniversary = new Date(nextYear, start.getMonth(), start.getDate());
  while (nextAnniversary <= new Date("2026-01-01")) {
    nextYear += 1;
    nextAnniversary = new Date(nextYear, start.getMonth(), start.getDate());
  }
  const periodEnd = new Date(nextYear, start.getMonth(), start.getDate() - 1);
  return { periodStart: "2026-01-01", periodEnd: formatDate(periodEnd) };
}

export async function getLeaveBalance(
  employeeId: string,
  leaveType: LeaveType,
  employeeStartDate: string,
  transitionAnnualDays?: number | null,
): Promise<LeaveBalance> {
  const policies = await getLeavePolicies(employeeId);
  const policy = policies.find((p) => p.leave_type === leaveType);

  const totalDays = policy?.total_days ?? 0;
  const unlimited = totalDays === -1;

  const { periodStart, periodEnd } = calculateAnniversaryPeriod(
    employeeStartDate,
  );

  const usedDays = await getApprovedDaysInPeriod(
    employeeId,
    leaveType,
    periodStart,
    periodEnd,
  );

  // Calculate transition period balance (only for annual leave with transition days set)
  let transitionDays: number | null = null;
  let transitionUsedDays: number | null = null;

  if (leaveType === "annual" && transitionAnnualDays != null) {
    const transition = calculateTransitionPeriod(employeeStartDate);
    transitionDays = transitionAnnualDays;
    transitionUsedDays = await getApprovedDaysInPeriod(
      employeeId,
      leaveType,
      transition.periodStart,
      transition.periodEnd,
    );
  }

  return {
    leave_type: leaveType,
    total_days: totalDays,
    used_days: usedDays,
    remaining_days: unlimited ? Infinity : totalDays - usedDays,
    transition_days: transitionDays,
    transition_used_days: transitionUsedDays,
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
