import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { SessionData, LeaveType } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { getAllEmployees } from "@/lib/supabase/queries";
import { getLeaveBalance } from "@/lib/leave/balance";

const ALL_LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "remote",
  "family_care",
  "menstrual",
];

const balanceQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]),
});

export const GET = withAdmin(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const params = balanceQuerySchema.safeParse({
        format: searchParams.get("format") ?? undefined,
      });

      if (!params.success) {
        const firstError =
          params.error.issues[0]?.message ?? "Invalid query parameters";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const { format } = params.data;

      const employees = await getAllEmployees();

      // Fetch balances for all employees and all leave types
      const rows: {
        employeeName: string;
        leaveType: string;
        entitled: number;
        used: number;
        remaining: number;
      }[] = [];

      for (const employee of employees) {
        const balances = await Promise.all(
          ALL_LEAVE_TYPES.map((type) =>
            getLeaveBalance(employee.id, type, employee.start_date),
          ),
        );

        for (const balance of balances) {
          // Only include rows where there is a policy (entitled > 0) or usage
          if (balance.total_days > 0 || balance.used_days > 0) {
            rows.push({
              employeeName: employee.name,
              leaveType: balance.leave_type,
              entitled: balance.total_days,
              used: balance.used_days,
              remaining: balance.remaining_days,
            });
          }
        }
      }

      if (format === "csv") {
        return buildCsvResponse(rows);
      }

      return buildPdfResponse(rows);
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to generate balance report" },
        { status: 500 },
      );
    }
  },
);

function buildCsvResponse(
  rows: {
    employeeName: string;
    leaveType: string;
    entitled: number;
    used: number;
    remaining: number;
  }[],
): NextResponse {
  const headers = [
    "Employee Name",
    "Leave Type",
    "Entitled",
    "Used",
    "Remaining",
  ];

  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(
      [
        escapeCsv(row.employeeName),
        escapeCsv(row.leaveType),
        String(row.entitled),
        String(row.used),
        String(row.remaining),
      ].join(","),
    );
  }

  const csv = csvLines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balance-report.csv"',
    },
  });
}

function buildPdfResponse(
  rows: {
    employeeName: string;
    leaveType: string;
    entitled: number;
    used: number;
    remaining: number;
  }[],
): NextResponse {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Leave Balance Report", 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toISOString().split("T")[0]}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [["Employee Name", "Leave Type", "Entitled", "Used", "Remaining"]],
    body: rows.map((r) => [
      r.employeeName,
      r.leaveType,
      String(r.entitled),
      String(r.used),
      String(r.remaining),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="balance-report.pdf"',
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
