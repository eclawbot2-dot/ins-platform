import { describe, it, expect, afterEach } from "vitest";
import { isPortalHost } from "@/lib/redirect";

const ORIG = process.env.PORTAL_HOST;
afterEach(() => {
  if (ORIG === undefined) delete process.env.PORTAL_HOST;
  else process.env.PORTAL_HOST = ORIG;
});

describe("isPortalHost (portal root-redirect routing)", () => {
  it("matches the configured PORTAL_HOST exactly (ignoring port)", () => {
    process.env.PORTAL_HOST = "portal.taboragency.com";
    expect(isPortalHost("portal.taboragency.com")).toBe(true);
    expect(isPortalHost("portal.taboragency.com:443")).toBe(true);
  });

  it("treats the staff host as NOT a portal host", () => {
    process.env.PORTAL_HOST = "portal.taboragency.com";
    expect(isPortalHost("ins.jahdev.com")).toBe(false);
    expect(isPortalHost("ins.jahdev.com:3220")).toBe(false);
  });

  it("auto-detects any host starting with 'portal.' even without env", () => {
    delete process.env.PORTAL_HOST;
    expect(isPortalHost("portal.example.com")).toBe(true);
    expect(isPortalHost("PORTAL.Taboragency.COM")).toBe(true);
  });

  it("is false for null/empty/non-portal hosts", () => {
    delete process.env.PORTAL_HOST;
    expect(isPortalHost(null)).toBe(false);
    expect(isPortalHost(undefined)).toBe(false);
    expect(isPortalHost("")).toBe(false);
    expect(isPortalHost("ins.jahdev.com")).toBe(false);
    expect(isPortalHost("localhost:3220")).toBe(false);
  });
});
