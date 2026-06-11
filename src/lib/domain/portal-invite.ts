/**
 * Portal-invite token lifecycle — pure logic (token hashing, expiry,
 * single-use, revocation). DB orchestration lives in
 * src/lib/portal-invite.ts; this module is unit-tested without a DB.
 */

import crypto from "node:crypto";

export const INVITE_TTL_DAYS = 7;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Random URL-safe invite token (raw value goes in the email only). */
export function newInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Only this SHA-256 hash of the token is ever stored. */
export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_MS);
}

export type InviteState = "valid" | "used" | "revoked" | "expired";

export type InviteLifecycleFields = {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Single source of truth for whether an invite is still acceptable.
 * Precedence: used > revoked > expired — a consumed token never
 * "un-consumes" by also being revoked or expiring.
 */
export function inviteState(invite: InviteLifecycleFields, now: Date = new Date()): InviteState {
  if (invite.usedAt) return "used";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function inviteStateMessage(state: InviteState): string {
  switch (state) {
    case "valid":
      return "";
    case "used":
      return "This invitation has already been used. Sign in instead.";
    case "revoked":
      return "This invitation was revoked by the agency. Contact us for a new one.";
    case "expired":
      return "This invitation has expired. Ask the agency to send a new one.";
  }
}
