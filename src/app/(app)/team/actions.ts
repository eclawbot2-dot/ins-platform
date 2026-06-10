"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fEnum } from "@/lib/form";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "PRODUCER", "CSR"];

export async function createUser(formData: FormData) {
  const session = await requireAdmin();
  const email = fStr(formData, "email").toLowerCase();
  const password = fStr(formData, "password");
  if (!email || !password || password.length < 8) {
    redirect(`/team?toastError=${encodeURIComponent("Email and a password of 8+ characters are required")}`);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect(`/team?toastError=${encodeURIComponent("A user with that email already exists")}`);

  const user = await prisma.user.create({
    data: {
      email,
      name: fStr(formData, "name") || email,
      password: await bcrypt.hash(password, 12),
      role: fEnum(formData, "role", ROLES, "CSR"),
      phone: fStrOpt(formData, "phone"),
      npn: fStrOpt(formData, "npn"),
      defaultSplitPct: Math.min(100, Math.max(0, fNum(formData, "defaultSplitPct", 100))),
    },
  });
  await audit({ userId: session.userId, action: "USER_CREATE", entityType: "User", entityId: user.id, detail: email });
  revalidatePath("/team");
  redirect(`/team?toast=${encodeURIComponent(`User ${user.name} created`)}`);
}

export async function updateUser(userId: string, formData: FormData) {
  const session = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: fStr(formData, "name") || undefined,
      role: fEnum(formData, "role", ROLES, "CSR"),
      phone: fStrOpt(formData, "phone"),
      npn: fStrOpt(formData, "npn"),
      defaultSplitPct: Math.min(100, Math.max(0, fNum(formData, "defaultSplitPct", 100))),
    },
  });
  await audit({ userId: session.userId, action: "USER_UPDATE", entityType: "User", entityId: userId });
  revalidatePath("/team");
  redirect(`/team?toast=${encodeURIComponent("User updated")}`);
}

export async function toggleUserActive(userId: string) {
  const session = await requireAdmin();
  if (userId === session.userId) {
    redirect(`/team?toastError=${encodeURIComponent("You cannot deactivate yourself")}`);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!user) redirect(`/team?toastError=${encodeURIComponent("User not found")}`);
  await prisma.user.update({
    where: { id: userId },
    data: { active: !user.active, sessionsRevokedAt: user.active ? new Date() : undefined },
  });
  await audit({
    userId: session.userId,
    action: user.active ? "USER_DEACTIVATE" : "USER_ACTIVATE",
    entityType: "User",
    entityId: userId,
  });
  revalidatePath("/team");
  redirect(`/team?toast=${encodeURIComponent(user.active ? "User deactivated" : "User reactivated")}`);
}

export async function setUserPassword(userId: string, formData: FormData) {
  const session = await requireAdmin();
  const password = fStr(formData, "password");
  if (password.length < 8) {
    redirect(`/team?toastError=${encodeURIComponent("Password must be 8+ characters")}`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(password, 12), sessionsRevokedAt: new Date() },
  });
  await audit({ userId: session.userId, action: "USER_PASSWORD_SET", entityType: "User", entityId: userId });
  revalidatePath("/team");
  redirect(`/team?toast=${encodeURIComponent("Password updated — existing sessions revoked")}`);
}
