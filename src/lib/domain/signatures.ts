/**
 * Pure e-signature lifecycle logic (Wave D-final). No DB, no I/O — the
 * state machine + sign-here packet text are unit-tested in isolation.
 */

import type { SignatureStatus } from "@prisma/client";

/** Statuses from which a request can still be acted on (not terminal). */
export const SIGNATURE_OPEN_STATUSES: SignatureStatus[] = ["DRAFT", "SENT", "VIEWED"];

/** Terminal statuses — nothing more happens. */
export const SIGNATURE_TERMINAL_STATUSES: SignatureStatus[] = [
  "SIGNED",
  "DECLINED",
  "VOIDED",
  "EXPIRED",
];

/** Allowed status transitions for the request state machine. */
const TRANSITIONS: Record<SignatureStatus, SignatureStatus[]> = {
  DRAFT: ["SENT", "VOIDED"],
  SENT: ["VIEWED", "SIGNED", "DECLINED", "VOIDED", "EXPIRED"],
  VIEWED: ["SIGNED", "DECLINED", "VOIDED", "EXPIRED"],
  SIGNED: [],
  DECLINED: [],
  VOIDED: [],
  EXPIRED: [],
};

/** Is `to` a legal next state from `from`? */
export function canTransition(from: SignatureStatus, to: SignatureStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOpen(status: SignatureStatus): boolean {
  return SIGNATURE_OPEN_STATUSES.includes(status);
}

export function isTerminal(status: SignatureStatus): boolean {
  return SIGNATURE_TERMINAL_STATUSES.includes(status);
}

/** Has the request passed its expiry (and is still open)? */
export function isExpired(
  req: { status: SignatureStatus; expiresAt?: Date | null },
  asOf: Date = new Date(),
): boolean {
  if (!isOpen(req.status)) return false;
  return req.expiresAt != null && req.expiresAt.getTime() < asOf.getTime();
}

export type PacketContext = {
  agencyName: string;
  title: string;
  signerName: string;
  docKindLabel: string;
  message?: string | null;
  date: string;
};

/**
 * Build the printable manual "sign here" packet body. Used when no
 * e-sign provider is configured — staff print it, get a wet signature,
 * then mark the request SIGNED in the app.
 */
export function buildSignHerePacket(ctx: PacketContext): string {
  const lines = [
    ctx.agencyName,
    "SIGNATURE REQUEST",
    "",
    `Document: ${ctx.title} (${ctx.docKindLabel})`,
    `Prepared for: ${ctx.signerName}`,
    `Date prepared: ${ctx.date}`,
    "",
    ctx.message ? `Note from your agent:\n${ctx.message}\n` : null,
    "By signing below, I acknowledge I have reviewed the document referenced",
    "above and agree to its terms.",
    "",
    "",
    "X ______________________________________    Date: ______________",
    `   ${ctx.signerName}`,
    "",
    "Please sign and return to your agent. If you have questions, contact the",
    "agency before signing.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
