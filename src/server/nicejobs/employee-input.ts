import { z } from "zod";
import { evidenceInput } from "./onboarding-input";
import { requiredUtcDate, priorities } from "@/server/domain/execution-input";

const id = z.string().min(1).max(200);
const reason = z.string().trim().min(1).max(1000);
const base = { idempotencyKey: z.uuid(), confirmed: z.literal(true) };
export const employeeCommand = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("ACTIVATE"), applicationReference: z.uuid(), revision: z.number().int().min(0), managerId: id.optional(), startDate: requiredUtcDate, reason }).strict(),
  z.object({ ...base, operation: z.literal("ASSIGN_TASK"), assignmentId: id, title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional(), projectId: id.optional(), goalId: id.optional(), priority: z.enum(priorities).default("NORMAL"), dueDate: requiredUtcDate.optional(), evidenceRequired: z.boolean().default(false), reason }).strict(),
  z.object({ ...base, operation: z.literal("TASK_STATE"), taskId: id, revision: z.number().int().min(0), to: z.enum(["IN_PROGRESS", "COMPLETED"]), evidence: evidenceInput.optional() }).strict(),
  z.object({ ...base, operation: z.literal("DAILY_REPORT"), reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().trim().max(4000).optional(), supersedesId: id.optional(), correctionReason: reason.optional() }).strict(),
  z.object({ ...base, operation: z.literal("BLOCKER"), taskId: id.optional(), reason, description: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ ...base, operation: z.literal("RESOLVE_BLOCKER"), blockerId: id, revision: z.number().int().min(0), reason }).strict(),
  z.object({ ...base, operation: z.literal("SET_MANAGER"), assignmentId: id, revision: z.number().int().min(0), managerId: id, reason }).strict(),
  z.object({ ...base, operation: z.literal("REMIND"), assignmentId: id.optional(), kind: z.enum(["DUE", "OVERDUE", "MISSING_REPORT", "BLOCKER", "PENDING"]), reason }).strict(),
]);
export const employeeQuery = z.object({ companyId: id.optional(), divisionId: id.optional(), jobId: id.optional(), managerId: id.optional(), status: z.enum(["ACTIVE", "SUSPENDED", "PREPARED", "ENDED"]).optional(), attention: z.enum(["BLOCKED", "NO_MANAGER", "OVERDUE"]).optional(), search: z.string().trim().max(120).default(""), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
export const workQuery = z.object({ view: z.enum(["all", "today", "pending", "completed", "overdue"]).default("all"), search: z.string().trim().max(120).default(""), after: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
