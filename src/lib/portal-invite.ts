/**
 * Portal invite orchestration — create/resend/revoke (staff side) and
 * accept (public side). Token mechanics live in the pure module
 * src/lib/domain/portal-invite.ts.
 *
 * Emails are sent through the existing transport (log-only until the
 * domain is verified in Resend) and link to PORTAL_URL, never to a URL
 * derived from the request (tunnel rule).
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { portalBaseUrl } from "@/lib/app-url";
import { BRAND } from "@/lib/brand";
import {
  hashInviteToken,
  inviteExpiry,
  inviteState,
  inviteStateMessage,
  newInviteToken,
  INVITE_TTL_DAYS,
} from "@/lib/domain/portal-invite";

export type CreateInviteResult = { ok: true; inviteId: string } | { ok: false; error: string };

/**
 * Create an invite for `email` to access `clientId`'s portal and send
 * the invitation email. Any previous pending invite for the same
 * (client, email) is revoked first — one live token per address.
 */
export async function createPortalInvite(
  clientId: string,
  emailRaw: string,
  createdById: string,
): Promise<CreateInviteResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return { ok: false, error: "Client not found." };

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { role: true, clientId: true },
  });
  if (existingUser && (existingUser.role !== "CLIENT" || existingUser.clientId !== clientId)) {
    return { ok: false, error: "That email already has an account that is not this client's portal login." };
  }

  const token = newInviteToken();
  await prisma.$transaction([
    prisma.portalInvite.updateMany({
      where: { clientId, email, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.portalInvite.create({
      data: {
        tokenHash: hashInviteToken(token),
        email,
        clientId,
        createdById,
        expiresAt: inviteExpiry(),
      },
    }),
  ]);
  const invite = await prisma.portalInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } });

  const url = `${portalBaseUrl()}/portal/accept-invite?token=${token}`;
  await sendEmail({
    to: email,
    subject: `You're invited to the ${BRAND.name} client portal`,
    text:
      `Hello,\n\n${BRAND.name} has set up secure online access for ${client.name}. ` +
      `Use the link below to choose a password and activate your account (valid for ${INVITE_TTL_DAYS} days):\n\n` +
      `${url}\n\n` +
      `In the portal you can review your policies, documents, invoices and claims, ` +
      `report a new claim, and request certificates of insurance.\n\n` +
      `If you weren't expecting this invitation, you can ignore this email.\n\n— ${BRAND.legalName}`,
    html:
      `<p>Hello,</p><p><strong>${BRAND.name}</strong> has set up secure online access for <strong>${client.name}</strong>.</p>` +
      `<p><a href="${url}">Activate your client portal account</a> (link valid for ${INVITE_TTL_DAYS} days).</p>` +
      `<p>In the portal you can review your policies, documents, invoices and claims, report a new claim, and request certificates of insurance.</p>` +
      `<p>If you weren't expecting this invitation, you can ignore this email.</p><p>— ${BRAND.legalName}</p>`,
  });

  return { ok: true, inviteId: invite!.id };
}

export type AcceptInviteResult = { ok: true; email: string } | { ok: false; error: string };

/** Look up an invite by raw token and report its acceptability. */
export async function findInviteByToken(token: string) {
  if (!token) return null;
  return prisma.portalInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { client: { select: { id: true, name: true } } },
  });
}

/**
 * Accept an invite: re-validate the token, then create (or relink) the
 * CLIENT user with the chosen password and mark the token used.
 */
export async function acceptPortalInvite(token: string, name: string, password: string): Promise<AcceptInviteResult> {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const invite = await findInviteByToken(token);
  if (!invite) return { ok: false, error: "This invitation link is invalid." };
  const state = inviteState(invite);
  if (state !== "valid") return { ok: false, error: inviteStateMessage(state) };

  const passwordHash = await bcrypt.hash(password, 12);
  const displayName = name.trim() || invite.client.name;

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true, role: true, clientId: true },
  });
  if (existing && (existing.role !== "CLIENT" || (existing.clientId && existing.clientId !== invite.clientId))) {
    return { ok: false, error: "An account with this email already exists. Contact the agency." };
  }

  await prisma.$transaction([
    existing
      ? prisma.user.update({
          where: { id: existing.id },
          data: { password: passwordHash, name: displayName, clientId: invite.clientId, active: true, sessionsRevokedAt: new Date() },
        })
      : prisma.user.create({
          data: {
            email: invite.email,
            name: displayName,
            password: passwordHash,
            role: "CLIENT",
            clientId: invite.clientId,
          },
        }),
    prisma.portalInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        actorEmail: invite.email,
        action: "PORTAL_INVITE_ACCEPT",
        entityType: "Client",
        entityId: invite.clientId,
        detail: invite.email,
      },
    }),
  ]);

  return { ok: true, email: invite.email };
}
