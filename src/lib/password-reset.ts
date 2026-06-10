/**
 * Password reset flow. Token is random 32 bytes; only its SHA-256 hash
 * is stored. Tokens live 60 minutes and are single-use.
 *
 * Portfolio UX rule: when the email is unknown we tell the user
 * "Email not found" explicitly — do NOT add anti-enumeration responses.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/app-url";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type RequestResetResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(emailRaw: string): Promise<RequestResetResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, active: true } });
  if (!user || !user.active) {
    // Intentional explicit response — see module docblock.
    return { ok: false, error: "Email not found" };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const url = `${appBaseUrl()}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your Ins Platform password",
    text: `Hi ${user.name},\n\nReset your password here (link valid for 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Hi ${user.name},</p><p><a href="${url}">Reset your password</a> (link valid for 1 hour).</p><p>If you didn't request this, ignore this email.</p>`,
  });

  return { ok: true };
}

export type CompleteResetResult = { ok: true } | { ok: false; error: string };

export async function completePasswordReset(token: string, newPassword: string): Promise<CompleteResetResult> {
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { password: passwordHash, sessionsRevokedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return { ok: true };
}
