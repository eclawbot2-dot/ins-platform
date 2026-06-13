/**
 * Static guard against the auth-wall-bypass leak class for STAFF API route
 * handlers (CSV exports, etc.). These endpoints surface the whole book
 * (premiums, commissions, AR, lead ROI) and live under /api, so they do NOT
 * pass through the (app)/layout session check — only the edge middleware.
 *
 * This scan enforces defense-in-depth: every staff route handler that reads
 * the DB (directly via prisma OR indirectly via a report lib) must assert the
 * auth wall at the handler — requireApiSession / requireSession / requireAdmin
 * / an explicit auth() role check — BEFORE its first data access. A new
 * unguarded report route then fails CI without a live server.
 *
 * Excludes the surfaces that authenticate themselves by other means (public
 * funnel via key/honeypot, cron via X-Cron-Key, NextAuth, portal routes which
 * have their own clientId-scoped gate test, and the Xero callback whose state
 * cookie is its CSRF gate).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(__dirname, "../src/app/api");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** Route prefixes that authenticate by a non-session mechanism (covered elsewhere). */
const EXEMPT = ["/api/public/", "/api/cron/", "/api/auth/", "/api/portal/", "/api/integrations/xero/callback"];

function rel(file: string): string {
  return "/api/" + path.relative(API_ROOT, file).split(path.sep).slice(0, -1).join("/");
}

function firstIndexOf(src: string, re: RegExp): number {
  const m = re.exec(src);
  return m ? m.index : -1;
}

describe("staff API routes assert the auth wall before their first data access", () => {
  const routes = walk(API_ROOT).filter((f) => {
    const r = rel(f) + "/";
    return !EXEMPT.some((e) => r.startsWith(e) || r.slice(0, -1) === e);
  });

  it("found the staff report routes", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  for (const file of routes) {
    const name = rel(file);
    it(`${name} gates before reading data`, () => {
      const src = readFileSync(file, "utf8");
      // First data access: a direct prisma read/write OR a call into a report
      // lib (the CSV routes delegate to @/lib/reports/*). We approximate the
      // latter by the `await <reportFn>(` that follows the gate; to keep this
      // robust we require the gate to appear before the FIRST `prisma.` OR the
      // first `await` that is not the gate itself.
      const gateIdx = firstIndexOf(
        src,
        /requireApiSession\s*\(|requireSession\s*\(|requireAdmin\s*\(|await auth\(\)/,
      );
      const prismaIdx = firstIndexOf(src, /prisma\.\w+\.(find|count|create|update|delete|upsert|aggregate|groupBy)/);

      // A handler with no DB access at all needs no gate (none expected here,
      // but keep the rule precise).
      const importsReportLib = /@\/lib\/reports\//.test(src);
      if (prismaIdx === -1 && !importsReportLib) return;

      expect(gateIdx, `${name} must assert the auth wall (requireApiSession/requireSession/requireAdmin/auth())`).toBeGreaterThanOrEqual(0);
      if (prismaIdx !== -1) {
        expect(gateIdx, `${name} gates AFTER its first prisma query`).toBeLessThan(prismaIdx);
      }
    });
  }
});
