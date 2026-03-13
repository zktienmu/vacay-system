"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeaveBalance, ApiResponse } from "@/types";

async function fetchBalances(): Promise<LeaveBalance[]> {
  const res = await fetch("/api/leave/balance");
  if (!res.ok) throw new Error("Failed to fetch leave balances");
  const json: ApiResponse<LeaveBalance[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Unknown error");
  return json.data;
}

export function useLeaveBalance() {
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ["leaveBalance"],
    queryFn: fetchBalances,
  });

  return { balances, isLoading };
}
