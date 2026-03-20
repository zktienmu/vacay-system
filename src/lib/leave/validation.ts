import { z } from "zod";

const leaveTypes = [
  "annual",
  "personal",
  "sick",
  "official",
  "unpaid",
  "remote",
] as const;

const leaveStatuses = ["approved", "rejected"] as const;

const roles = ["admin", "employee"] as const;

const ethereumAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

// === Auth ===

export const siweVerifySchema = z.object({
  message: z.string().min(1, "Message is required"),
  signature: z.string().min(1, "Signature is required"),
});

// === Leave Requests ===

export const createLeaveRequestSchema = z
  .object({
    leave_type: z.enum(leaveTypes),
    start_date: isoDate,
    end_date: isoDate,
    delegate_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (data) => new Date(data.end_date) >= new Date(data.start_date),
    { message: "End date must be on or after start date" },
  );

export const updateLeaveStatusSchema = z.object({
  status: z.enum(leaveStatuses),
});

export const cancelLeaveSchema = z.object({
  status: z.literal("cancelled"),
});

// === Employees ===

export const createEmployeeSchema = z.object({
  wallet_address: ethereumAddress,
  name: z.string().min(1).max(200),
  slack_user_id: z.string().nullable().optional(),
  start_date: isoDate,
  role: z.enum(roles).optional().default("employee"),
});

export const updateEmployeeSchema = z.object({
  wallet_address: ethereumAddress.optional(),
  name: z.string().min(1).max(200).optional(),
  slack_user_id: z.string().nullable().optional(),
  start_date: isoDate.optional(),
  role: z.enum(roles).optional(),
});

// === Public Holidays ===

export const createHolidaySchema = z.object({
  date: isoDate,
  name: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  year: z.number().int().min(2000).max(2100),
});

// === Leave Policies ===

export const upsertPolicySchema = z.object({
  leave_type: z.enum(leaveTypes),
  total_days: z.number().int().min(0).max(365),
  expires_at: z.string().datetime().nullable().optional(),
});
