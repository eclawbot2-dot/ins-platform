import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/domain/dates";
import { ThSort } from "@/components/ui/data-table";
import { applySort, parseSortParams } from "@/lib/sort";
import { createTask, setTaskStatus } from "./actions";
import { getWorkspaceSummary } from "@/lib/workspace/client";
import type { Prisma, TaskStatus } from "@prisma/client";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];

// Business priority order (not alphabetical).
const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string; sort?: string; dir?: string }>;
}) {
  const { status, mine } = await searchParams;
  const { sort, dir } = await searchParams;
  const sortState = parseSortParams(sort, dir, ["task", "linked", "assigned", "priority", "due", "status"]);
  const statusFilter = STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : undefined;

  const where: Prisma.TaskWhereInput = statusFilter ? { status: statusFilter } : { status: { in: ["OPEN", "IN_PROGRESS"] } };

  const [tasks, users, workspace] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }],
      take: 200,
      include: {
        assignedTo: { select: { name: true } },
        client: { select: { id: true, name: true } },
        policy: { select: { id: true, policyNumber: true } },
        claim: { select: { id: true, claimNumber: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
        renewal: { select: { id: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getWorkspaceSummary(),
  ]);

  const now = new Date();

  const sortedTasks = applySort(
    tasks,
    {
      task: (t) => t.title,
      linked: (t) =>
        t.client?.name ??
        t.policy?.policyNumber ??
        t.claim?.claimNumber ??
        (t.lead ? `${t.lead.firstName} ${t.lead.lastName}` : t.renewal ? "Renewal" : null),
      assigned: (t) => t.assignedTo?.name,
      priority: (t) => PRIORITY_ORDER[t.priority] ?? 9,
      due: (t) => t.dueDate,
      status: (t) => TASK_STATUS_LABELS[t.status],
    },
    sortState,
  );
  const tableSort = { ...sortState, basePath: "/tasks", params: { status: statusFilter, mine } };

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups, renewal work, claim chasers." />

      <div className="mb-4 flex gap-2">
        <Link href="/tasks" className={`btn btn-sm ${!statusFilter ? "border-navy-300 bg-navy-50" : ""}`}>
          Open
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/tasks?status=${s}`}
            className={`btn btn-sm ${statusFilter === s ? "border-navy-300 bg-navy-50" : ""}`}
          >
            {TASK_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <ThSort k="task" label="Task" sort={tableSort} />
              <ThSort k="linked" label="Linked to" sort={tableSort} />
              <ThSort k="assigned" label="Assigned" sort={tableSort} />
              <ThSort k="priority" label="Priority" sort={tableSort} />
              <ThSort k="due" label="Due" sort={tableSort} />
              <ThSort k="status" label="Status" sort={tableSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((t) => {
              const overdue = t.dueDate < now && (t.status === "OPEN" || t.status === "IN_PROGRESS");
              const link = t.client
                ? { href: `/clients/${t.client.id}`, label: t.client.name }
                : t.policy
                  ? { href: `/policies/${t.policy.id}`, label: t.policy.policyNumber }
                  : t.claim
                    ? { href: `/claims/${t.claim.id}`, label: t.claim.claimNumber }
                    : t.lead
                      ? { href: `/leads/${t.lead.id}`, label: `${t.lead.firstName} ${t.lead.lastName}` }
                      : t.renewal
                        ? { href: "/renewals", label: "Renewal" }
                        : null;
              return (
                <tr key={t.id}>
                  <td>
                    <div className="font-medium text-slate-800">{t.title}</div>
                    {t.detail ? <div className="text-xs text-slate-500">{t.detail}</div> : null}
                  </td>
                  <td>
                    {link ? (
                      <Link href={link.href} className="text-navy-700 hover:underline">
                        {link.label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{t.assignedTo?.name ?? "Unassigned"}</td>
                  <td>
                    <Badge tone={t.priority === "URGENT" ? "red" : t.priority === "HIGH" ? "amber" : "slate"}>{t.priority}</Badge>
                  </td>
                  <td>
                    <span className={overdue ? "font-semibold text-red-600" : ""}>{fmtDate(t.dueDate)}</span>
                  </td>
                  <td>
                    <Badge tone={t.status === "DONE" ? "green" : t.status === "CANCELLED" ? "slate" : "blue"}>
                      {TASK_STATUS_LABELS[t.status]}
                    </Badge>
                  </td>
                  <td>
                    {t.status === "OPEN" || t.status === "IN_PROGRESS" ? (
                      <form action={setTaskStatus.bind(null, t.id, "DONE")}>
                        <button className="btn btn-sm" type="submit">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Done
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No tasks.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card-pad mt-6 max-w-2xl">
        <h2 className="section-title mb-3">
          <Plus className="mr-1 inline h-4 w-4" /> New task
        </h2>
        <form action={createTask} className="space-y-4">
          <input name="title" placeholder="Task title" required className="input" />
          <textarea name="detail" placeholder="Detail (optional)" rows={2} className="input" />
          <FormGrid cols={3}>
            <Field label="Due date" required>
              <input type="date" name="dueDate" required className="input" />
            </Field>
            <Field label="Priority">
              <Select
                name="priority"
                defaultValue="NORMAL"
                options={["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => ({ value: p, label: p }))}
              />
            </Field>
            <Field label="Assign to">
              <Select name="assignedToId" allowEmpty emptyLabel="Unassigned" options={users.map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="addToCalendar" disabled={!workspace.saConfigured || !workspace.enabled} />
            Add to Google Calendar
            {!workspace.saConfigured || !workspace.enabled ? (
              <span className="text-xs text-slate-400">(Workspace not configured — see Settings → Integrations)</span>
            ) : null}
          </label>
          <button type="submit" className="btn-primary">
            Create task
          </button>
        </form>
      </div>
    </>
  );
}
