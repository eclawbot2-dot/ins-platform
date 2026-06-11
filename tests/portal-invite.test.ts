import { describe, it, expect } from "vitest";
import {
  INVITE_TTL_DAYS,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  inviteStateMessage,
  newInviteToken,
} from "@/lib/domain/portal-invite";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const FUTURE = new Date("2026-06-15T12:00:00.000Z");
const PAST = new Date("2026-06-01T12:00:00.000Z");

describe("invite tokens", () => {
  it("are unique, URL-safe, and high-entropy", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
  it("hash deterministically and never equal the raw token", () => {
    const t = newInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(t);
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("inviteExpiry", () => {
  it("is exactly the TTL after issuance", () => {
    const exp = inviteExpiry(NOW);
    expect(exp.getTime() - NOW.getTime()).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe("inviteState lifecycle", () => {
  const base = { expiresAt: FUTURE, usedAt: null, revokedAt: null };

  it("fresh invite is valid", () => {
    expect(inviteState(base, NOW)).toBe("valid");
  });

  it("expires after expiresAt (boundary inclusive)", () => {
    expect(inviteState({ ...base, expiresAt: PAST }, NOW)).toBe("expired");
    expect(inviteState({ ...base, expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("single-use: a consumed invite is never valid again", () => {
    expect(inviteState({ ...base, usedAt: PAST }, NOW)).toBe("used");
    // even when also expired or revoked, "used" wins
    expect(inviteState({ expiresAt: PAST, usedAt: PAST, revokedAt: PAST }, NOW)).toBe("used");
  });

  it("revocation blocks acceptance", () => {
    expect(inviteState({ ...base, revokedAt: PAST }, NOW)).toBe("revoked");
    expect(inviteState({ ...base, expiresAt: PAST, revokedAt: PAST }, NOW)).toBe("revoked");
  });

  it("every non-valid state has a user-facing message", () => {
    expect(inviteStateMessage("valid")).toBe("");
    for (const s of ["used", "revoked", "expired"] as const) {
      expect(inviteStateMessage(s).length).toBeGreaterThan(10);
    }
  });
});
