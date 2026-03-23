import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { getLeaveRequests, getAllEmployees } from "@/lib/supabase/queries";

const reportQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional(),
  employee_id: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
});

export const GET = withAdmin(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const params = reportQuerySchema.safeParse({
        format: searchParams.get("format") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        employee_id: searchParams.get("employee_id") ?? undefined,
        status: searchParams.get("status") ?? undefined,
      });

      if (!params.success) {
        const firstError =
          params.error.issues[0]?.message ?? "Invalid query parameters";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const { format, from, to, employee_id, status } = params.data;

      // Fetch leave requests with filters
      const filters: {
        employee_id?: string;
        status?: "pending" | "approved" | "rejected" | "cancelled";
        start_date?: string;
        end_date?: string;
      } = {};
      if (employee_id) filters.employee_id = employee_id;
      if (status) filters.status = status;
      if (from) filters.start_date = from;
      if (to) filters.end_date = to;

      const requests = await getLeaveRequests(filters);

      // Fetch all employees for name lookups
      const employees = await getAllEmployees();
      const employeeMap = new Map(employees.map((e) => [e.id, e.name]));

      // Build rows
      const rows = requests.map((r) => ({
        employeeName: employeeMap.get(r.employee_id) ?? "Unknown",
        leaveType: r.leave_type,
        startDate: r.start_date,
        endDate: r.end_date,
        days: r.days,
        status: r.status,
        delegate: r.delegate_ids?.length
          ? r.delegate_ids.map((id) => employeeMap.get(id) ?? "Unknown").join(", ")
          : r.delegate_id
            ? (employeeMap.get(r.delegate_id) ?? "-")
            : "-",
        notes: r.notes ?? "",
        requestedAt: r.created_at,
        reviewedBy: r.reviewed_by
          ? (employeeMap.get(r.reviewed_by) ?? "-")
          : "-",
        reviewedAt: r.reviewed_at ?? "-",
      }));

      if (format === "csv") {
        return buildCsvResponse(rows);
      }

      return buildPdfResponse(rows, from, to);
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to generate leave report" },
        { status: 500 },
      );
    }
  },
);

function buildCsvResponse(
  rows: {
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    delegate: string;
    notes: string;
    requestedAt: string;
    reviewedBy: string;
    reviewedAt: string;
  }[],
): NextResponse {
  const headers = [
    "Employee Name",
    "Leave Type",
    "Start Date",
    "End Date",
    "Days",
    "Status",
    "Delegate",
    "Notes",
    "Requested At",
    "Reviewed By",
    "Reviewed At",
  ];

  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(
      [
        escapeCsv(row.employeeName),
        escapeCsv(row.leaveType),
        escapeCsv(row.startDate),
        escapeCsv(row.endDate),
        String(row.days),
        escapeCsv(row.status),
        escapeCsv(row.delegate),
        escapeCsv(row.notes),
        escapeCsv(row.requestedAt),
        escapeCsv(row.reviewedBy),
        escapeCsv(row.reviewedAt),
      ].join(","),
    );
  }

  const csv = csvLines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leave-report.csv"',
    },
  });
}

function buildPdfResponse(
  rows: {
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    delegate: string;
    notes: string;
    requestedAt: string;
    reviewedBy: string;
    reviewedAt: string;
  }[],
  from?: string,
  to?: string,
): NextResponse {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(18);
  doc.text("Leave Report", 14, 20);

  doc.setFontSize(10);
  const dateRange =
    from && to
      ? `Period: ${from} to ${to}`
      : from
        ? `From: ${from}`
        : to
          ? `To: ${to}`
          : `Generated: ${new Date().toISOString().split("T")[0]}`;
  doc.text(dateRange, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [
      [
        "Employee",
        "Type",
        "Start",
        "End",
        "Days",
        "Status",
        "Delegate",
        "Notes",
        "Requested",
        "Reviewer",
        "Reviewed",
      ],
    ],
    body: rows.map((r) => [
      r.employeeName,
      r.leaveType,
      r.startDate,
      r.endDate,
      String(r.days),
      r.status,
      r.delegate,
      r.notes.length > 30 ? r.notes.substring(0, 30) + "..." : r.notes,
      r.requestedAt.split("T")[0] ?? r.requestedAt,
      r.reviewedBy,
      r.reviewedAt !== "-" ? (r.reviewedAt.split("T")[0] ?? r.reviewedAt) : "-",
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="leave-report.pdf"',
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
