"use client";

import { useQuery } from "@tanstack/react-query";
import type { Employee, ApiResponse } from "@/types";

async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch("/api/employees");
  if (!res.ok) throw new Error("Failed to fetch employees");
  const json: ApiResponse<Employee[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Unknown error");
  return json.data;
}

export function useEmployees() {
  const {
    data: employees = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  return { employees, isLoading, refetch };
}
