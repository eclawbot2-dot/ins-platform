"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fStr, fStrOpt, fDate, fEnum } from "@/lib/form";
import { resolveWorkspace } from "@/lib/workspace/client";
import { log } from "@/lib/log";
import type { TaskPriority, TaskStatus } from "@prisma/client";

const PRIORITIES: TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export async function createTask(formData: FormData) {
  const session = await requireSession();
  const dueDate = fDate(formData, "dueDate") ?? new Date();
  const task = await prisma.task.create({
    data: {
      title: fStr(formData, "title") || "Task",
      detail: fStrOpt(formData, "detail"),
      dueDate,
      priority: fEnum(formData, "priority", PRIORITIES, "NORMAL"),
      assignedToId: fStrOpt(formData, "assignedToId"),
      createdById: session.userId,
    },
  });

  // Optional Google Calendar event (degrades silently when Workspace
  // isn't configured).
  if (formData.get("addToCalendar") === "on") {
    const ws = await resolveWorkspace();
    if (ws.ok) {
      try {
        await ws.client.createCalendarEvent({
          title: `Task: ${task.title}`,
          description: task.detail ?? undefined,
          start: dueDate,
          end: dueDate,
          allDay: true,
        });
      } catch (err) {
        log.warn("calendar event creation failed", { module: "tasks" }, err);
      }
    }
  }
  redirect(`/tasks?toast=${encodeURIComponent("Task created")}`);
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  await requireSession();
  await prisma.task.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  revalidatePath("/tasks");
  redirect(`/tasks?toast=${encodeURIComponent(status === "DONE" ? "Task completed" : "Task updated")}`);
}
