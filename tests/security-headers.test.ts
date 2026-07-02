/**
 * Security-header regression guard. The app serves sensitive PII over
 * HTTPS behind the Cloudflare tunnel, so the baseline hardening headers —
 * including HSTS — must be present on every response. This imports the
 * real next.config.ts and asserts the header set the app ships, so a
 * regression (a dropped or weakened header) fails CI without a live server.
 */
import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

describe("security headers", () => {
  it("ships the baseline hardening headers on all paths", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all, "a /:path* header rule must exist").toBeTruthy();

    const byKey = new Map(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));

    expect(byKey.get("x-content-type-options")).toBe("nosniff");
    expect(byKey.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(byKey.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("permissions-policy")).toContain("geolocation=()");
  });

  it("pins the browser to HTTPS with HSTS (>= 6 months, includeSubDomains)", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    const hsts = all.headers.find((h) => h.key.toLowerCase() === "strict-transport-security");
    expect(hsts, "Strict-Transport-Security must be set (PII app, HTTPS-only)").toBeTruthy();

    const maxAge = Number(/max-age=(\d+)/.exec(hsts!.value)?.[1] ?? "0");
    expect(maxAge).toBeGreaterThanOrEqual(15552000); // 180 days
    expect(hsts!.value).toContain("includeSubDomains");
  });
});
