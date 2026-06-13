/**
 * Static guard against the audited RSC-flight-payload leak class: every
 * portal page must call requirePortalSession() BEFORE its first prisma
 * query, and every portal server action must call requireClientUser()
 * before its first query. This scans the source so a regression (a new
 * portal page that queries before gating) fails CI without a live server.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PORTAL_AUTHED = path.resolve(__dirname, "../src/app/portal/(authed)");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function firstIndexOf(src: string, re: RegExp): number {
  const m = re.exec(src);
  return m ? m.index : -1;
}

describe("portal pages gate the session before their first query", () => {
  const pages = walk(PORTAL_AUTHED).filter((f) => f.endsWith("page.tsx"));

  it("there is at least one portal page to check", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  for (const file of pages) {
    const rel = path.relative(PORTAL_AUTHED, file);
    it(`${rel} calls requirePortalSession before any prisma query`, () => {
      const src = readFileSync(file, "utf8");
      const queryIdx = firstIndexOf(src, /prisma\.\w+\.(find|count|aggregate|groupBy)/);
      if (queryIdx === -1) return; // no direct query in this page — fine
      const gateIdx = firstIndexOf(src, /requirePortalSession\s*\(/);
      expect(gateIdx, `${rel} must call requirePortalSession()`).toBeGreaterThanOrEqual(0);
      expect(gateIdx, `${rel} gates AFTER its first query`).toBeLessThan(queryIdx);
    });
  }
});

/** Split a source file into top-level `export async function NAME(...) {…}` blocks. */
function exportedFunctions(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; idx: number }> = [];
  while ((m = re.exec(src))) starts.push({ name: m[1]!, idx: m.index });
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i]!.idx;
    const end = i + 1 < starts.length ? starts[i + 1]!.idx : src.length;
    out.push({ name: starts[i]!.name, body: src.slice(begin, end) });
  }
  return out;
}

describe("portal server actions gate on requireClientUser and scope by session clientId", () => {
  const actionFiles = walk(PORTAL_AUTHED).filter((f) => f.endsWith("actions.ts"));

  for (const file of actionFiles) {
    const rel = path.relative(PORTAL_AUTHED, file);
    // Check EACH exported action: a query before the gate WITHIN the action
    // body is the leak; private helpers are only ever reached from a gated
    // action, so they're scanned at their call site, not in isolation.
    for (const fn of exportedFunctions(readFileSync(file, "utf8"))) {
      it(`${rel}:${fn.name} calls requireClientUser before any prisma query`, () => {
        const queryIdx = firstIndexOf(fn.body, /prisma\.\w+\.(find|count|create|update|delete|upsert|aggregate)/);
        if (queryIdx === -1) return;
        const gateIdx = firstIndexOf(fn.body, /requireClientUser\s*\(/);
        expect(gateIdx, `${rel}:${fn.name} must call requireClientUser()`).toBeGreaterThanOrEqual(0);
        expect(gateIdx, `${rel}:${fn.name} gates AFTER its first query`).toBeLessThan(queryIdx);
      });
    }

    it(`${rel} never trusts a body clientId (re-derives from session)`, () => {
      const src = readFileSync(file, "utf8");
      // The clientId must come from the session, not from form/body fields.
      expect(src).not.toMatch(/fStr\w*\([^)]*["']clientId["']/);
    });
  }

  it("the new EOI request action validates policy ownership via portalPolicyWhere", () => {
    const src = readFileSync(path.join(PORTAL_AUTHED, "actions.ts"), "utf8");
    expect(src).toContain("portalRequestEoi");
    // The EOI handler scopes the policy lookup by the session clientId.
    const eoiBlock = src.slice(src.indexOf("portalRequestEoi"));
    expect(eoiBlock.slice(0, 1200)).toContain("portalPolicyWhere(clientId)");
  });
});
