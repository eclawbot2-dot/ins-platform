"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { fStr, fStrOpt } from "@/lib/form";
import { addDays } from "@/lib/domain/dates";
import { log } from "@/lib/log";

/**
 * Public form — anyone can ask for portal access. Creates a staff task
 * (assigned to the first active admin) instead of touching any client
 * data. Rate-limited per IP because it is unauthenticated.
 */
export async function requestAccessAction(formData: FormData) {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "?";
  const limit = consumeRateLimit(`portal-access:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    redirect(`/portal/request-access?error=${encodeURIComponent("Too many requests — please try again later.")}`);
  }

  const name = fStr(formData, "name");
  const email = fStr(formData, "email").toLowerCase();
  const message = fStrOpt(formData, "message");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/portal/request-access?error=${encodeURIComponent("Enter your name and a valid email address.")}`);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  await prisma.task.create({
    data: {
      title: `Portal access request: ${name} <${email}>`,
      detail: [`Submitted via /portal/request-access (ip ${ip}).`, message ? `Message: ${message}` : null]
        .filter(Boolean)
        .join("\n"),
      dueDate: addDays(new Date(), 2),
      priority: "NORMAL",
      assignedToId: admin?.id ?? null,
    },
  });
  log.info("portal access request", { module: "portal", email, ip });

  redirect("/portal/request-access?sent=1");
}
