import { projectStatuses, taskStatuses, goalStatuses, priorities } from "@/server/domain/execution-input";
export type Field = { key: string; label: string; type?: string; source?: string; values?: readonly string[]; required?: boolean };
const org: Field = { key: "organizationId", label: "Organization", source: "organizations", required: true };
const project: Field = { key: "projectId", label: "Project", source: "projects" };
const owner: Field = { key: "ownerPersonId", label: "Owner", source: "people" };
const accountable: Field = { key: "accountablePersonId", label: "Accountable person", source: "people" };
const description: Field = { key: "description", label: "Description", type: "textarea" };
const priority: Field = { key: "priority", label: "Priority", values: priorities };
const target: Field = { key: "targetDate", label: "Target date (UTC)", type: "date" };
const start: Field = { key: "startDate", label: "Start date (UTC)", type: "date" };
const metadata: Field = { key: "metadata", label: "Metadata", type: "textarea" };
export const fields: Record<string, Field[]> = {
  projects: [org, { key: "name", label: "Name", required: true }, { key: "slug", label: "Reference", required: true }, description, { key: "status", label: "Status", values: projectStatuses }, priority, owner, accountable, { key: "productId", label: "Product", source: "products" }, { key: "brandId", label: "Brand", source: "brands" }, start, target, { key: "health", label: "Health", values: ["UNKNOWN", "ON_TRACK", "AT_RISK", "OFF_TRACK"] }, metadata],
  milestones: [org, { ...project, required: true }, { key: "name", label: "Name", required: true }, description, { key: "status", label: "Status", values: projectStatuses }, priority, owner, target, { key: "sequence", label: "Sequence", type: "number" }, metadata],
  tasks: [org, { key: "title", label: "Title", required: true }, description, { key: "status", label: "Status", values: taskStatuses }, priority, project, { key: "milestoneId", label: "Milestone", source: "milestones" }, { key: "goalId", label: "Goal", source: "goals" }, owner, { key: "assigneePersonId", label: "Assignee", source: "people" }, start, { key: "dueDate", label: "Due date (UTC)", type: "date" }, { key: "estimatedHours", label: "Estimated hours", type: "number" }, metadata],
  goals: [org, { key: "title", label: "Title", required: true }, description, { key: "status", label: "Status", values: goalStatuses }, priority, project, { key: "productId", label: "Product", source: "products" }, owner, accountable, { key: "parentGoalId", label: "Parent goal", source: "goals" }, start, target, { key: "progressMode", label: "Progress basis", values: ["MANUAL", "TASKS", "MILESTONES"] }, metadata],
  dependencies: [{ key: "taskId", label: "Task", source: "tasks", required: true }, { key: "relationship", label: "Relationship", values: ["DEPENDS_ON", "BLOCKED_BY", "BLOCKS"] }, { key: "prerequisiteId", label: "Other task", source: "tasks", required: true }],
  blockers: [org, project, { key: "taskId", label: "Task", source: "tasks" }, { key: "goalId", label: "Goal", source: "goals" }, { ...description, required: true }, owner, { key: "dependencyTaskId", label: "Dependency", source: "tasks" }, { key: "expectedResolution", label: "Expected resolution (UTC)", type: "date" }, { key: "status", label: "Status", values: ["OPEN", "RESOLVED"] }],
  members: [org, { ...project, required: true }, { key: "personId", label: "Person", source: "people", required: true }, { key: "title", label: "Membership title" }, { key: "status", label: "Status", values: ["ACTIVE", "INVITED", "INACTIVE", "SUSPENDED", "ENDED"] }, start, { key: "endDate", label: "End date (UTC, exclusive)", type: "date" }],
  responsibilities: [org, project, { key: "taskId", label: "Task", source: "tasks" }, { key: "milestoneId", label: "Milestone", source: "milestones" }, { key: "goalId", label: "Goal", source: "goals" }, { key: "personId", label: "Person", source: "people", required: true }, { key: "title", label: "Responsibility", required: true }, { key: "status", label: "Status", values: ["ACTIVE", "INACTIVE", "ARCHIVED"] }],
};
