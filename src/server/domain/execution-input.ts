import { z } from "zod";

const id = z.string().min(1).max(200);
const reference = id.nullable().optional();
const text = z.string().trim().min(1).max(200);
const description = z.string().trim().max(4000).nullable().optional();
// Date-only values are UTC midnight; instants must carry an explicit timezone.
const date = z.union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/).refine(v => { const day = new Date(v.slice(0, 10)); return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === v.slice(0, 10); }, "Invalid calendar date").transform(v => new Date(v))]).refine(v => !Number.isNaN(v.getTime()), "Invalid UTC date").nullable().optional();
export const projectStatuses = ["PLANNED", "ACTIVE", "PAUSED", "BLOCKED", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const taskStatuses = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export const goalStatuses = ["DRAFT", "ACTIVE", "PAUSED", "AT_RISK", "ACHIEVED", "MISSED", "CANCELLED", "ARCHIVED"] as const;
export const priorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const common = { organizationId: id, description, priority: z.enum(priorities).default("NORMAL"), ownerPersonId: reference, metadata: z.record(z.string(), z.unknown()).nullable().optional().transform(v => v == null ? v : JSON.stringify(v)), reopen: z.boolean().default(false) };
const range = (v: { startDate?: Date | null; targetDate?: Date | null; dueDate?: Date | null }) => !v.startDate || !(v.targetDate ?? v.dueDate) || (v.targetDate ?? v.dueDate)! >= v.startDate;
export const projectInput = z.object({ ...common, programId: reference, name: text, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), status: z.enum(projectStatuses).default("ACTIVE"), accountablePersonId: reference, brandId: reference, productId: reference, startDate: date, targetDate: date, health: z.enum(["UNKNOWN", "ON_TRACK", "AT_RISK", "OFF_TRACK"]).default("UNKNOWN") }).refine(range, "Target date precedes start date");
export const milestoneInput = z.object({ ...common, projectId: id, name: text, status: z.enum(projectStatuses).default("PLANNED"), targetDate: date, sequence: z.number().int().min(0).default(0) });
export const taskInput = z.object({ ...common, title: text, status: z.enum(taskStatuses).default("TODO"), projectId: reference, milestoneId: reference, goalId: reference, assigneePersonId: reference, startDate: date, dueDate: date, estimatedHours: z.number().min(0).max(100000).nullable().optional() }).refine(range, "Due date precedes start date");
export const goalInput = z.object({ ...common, programId: reference, title: text, status: z.enum(goalStatuses).default("DRAFT"), projectId: reference, productId: reference, accountablePersonId: reference, parentGoalId: reference, startDate: date, targetDate: date, progressMode: z.enum(["MANUAL", "TASKS", "MILESTONES"]).default("MANUAL"), progress: z.number().min(0).max(100).optional(), progressReason: description }).refine(range, "Target date precedes start date");
export const dependencyInput = z.object({ taskId: id, prerequisiteId: id, relationship: z.enum(["DEPENDS_ON", "BLOCKED_BY", "BLOCKS"]).default("DEPENDS_ON") });
export const blockerInput = z.object({ organizationId: id, projectId: reference, taskId: reference, goalId: reference, description: z.string().trim().min(1).max(4000), ownerPersonId: reference, dependencyTaskId: reference, expectedResolution: date, status: z.enum(["OPEN", "RESOLVED"]).default("OPEN") }).refine(v => [v.projectId, v.taskId, v.goalId].filter(Boolean).length === 1, "Choose exactly one blocker target");
export const executionKinds = ["projects", "milestones", "tasks", "goals", "dependencies", "blockers", "members", "responsibilities"] as const;
export type ExecutionKind = typeof executionKinds[number];
export const requiredUtcDate = date.unwrap().unwrap();
