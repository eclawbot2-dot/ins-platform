import { describe, it, expect } from "vitest";
import {
  canTransition,
  isOpen,
  isTerminal,
  isExpired,
  buildSignHerePacket,
  SIGNATURE_OPEN_STATUSES,
  SIGNATURE_TERMINAL_STATUSES,
} from "@/lib/domain/signatures";
import { configuredProvider } from "@/lib/signatures/provider";

describe("signature state machine", () => {
  it("DRAFT can be sent or voided, not signed directly", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("DRAFT", "VOIDED")).toBe(true);
    expect(canTransition("DRAFT", "SIGNED")).toBe(false);
  });

  it("SENT can progress to viewed/signed/declined/voided/expired", () => {
    for (const to of ["VIEWED", "SIGNED", "DECLINED", "VOIDED", "EXPIRED"] as const) {
      expect(canTransition("SENT", to)).toBe(true);
    }
  });

  it("terminal states allow no further transitions", () => {
    for (const from of SIGNATURE_TERMINAL_STATUSES) {
      expect(canTransition(from, "SENT")).toBe(false);
      expect(canTransition(from, "SIGNED")).toBe(false);
    }
  });

  it("isOpen / isTerminal partition the statuses", () => {
    for (const s of SIGNATURE_OPEN_STATUSES) {
      expect(isOpen(s)).toBe(true);
      expect(isTerminal(s)).toBe(false);
    }
    for (const s of SIGNATURE_TERMINAL_STATUSES) {
      expect(isTerminal(s)).toBe(true);
      expect(isOpen(s)).toBe(false);
    }
  });
});

describe("isExpired", () => {
  const now = new Date("2026-06-12T00:00:00Z");
  it("is true only for an OPEN request past its expiry", () => {
    expect(isExpired({ status: "SENT", expiresAt: new Date("2026-06-01T00:00:00Z") }, now)).toBe(true);
    expect(isExpired({ status: "SENT", expiresAt: new Date("2026-06-30T00:00:00Z") }, now)).toBe(false);
  });
  it("never reports a terminal request as expired", () => {
    expect(isExpired({ status: "SIGNED", expiresAt: new Date("2026-06-01T00:00:00Z") }, now)).toBe(false);
  });
  it("no expiry → never expired", () => {
    expect(isExpired({ status: "SENT", expiresAt: null }, now)).toBe(false);
  });
});

describe("buildSignHerePacket", () => {
  it("includes the signer, doc title, agency and a signature line", () => {
    const packet = buildSignHerePacket({
      agencyName: "Tabor Agency",
      title: "Auto Proposal",
      signerName: "Jane Doe",
      docKindLabel: "Proposal",
      message: "Please review.",
      date: "Jun 12, 2026",
    });
    expect(packet).toContain("Tabor Agency");
    expect(packet).toContain("Auto Proposal");
    expect(packet).toContain("Jane Doe");
    expect(packet).toContain("Please review.");
    expect(packet).toMatch(/X _+/);
  });

  it("omits the note block when no message is supplied", () => {
    const packet = buildSignHerePacket({
      agencyName: "Tabor Agency",
      title: "App",
      signerName: "Joe",
      docKindLabel: "Application",
      message: null,
      date: "Jun 12, 2026",
    });
    expect(packet).not.toContain("Note from your agent");
  });
});

describe("configuredProvider", () => {
  it("defaults to MANUAL when ESIGN_PROVIDER is unset", () => {
    const prev = process.env.ESIGN_PROVIDER;
    delete process.env.ESIGN_PROVIDER;
    expect(configuredProvider()).toBe("MANUAL");
    if (prev !== undefined) process.env.ESIGN_PROVIDER = prev;
  });
  it("maps docusign / dropbox_sign aliases", () => {
    const prev = process.env.ESIGN_PROVIDER;
    process.env.ESIGN_PROVIDER = "docusign";
    expect(configuredProvider()).toBe("DOCUSIGN");
    process.env.ESIGN_PROVIDER = "dropbox-sign";
    expect(configuredProvider()).toBe("DROPBOX_SIGN");
    if (prev === undefined) delete process.env.ESIGN_PROVIDER;
    else process.env.ESIGN_PROVIDER = prev;
  });
});
