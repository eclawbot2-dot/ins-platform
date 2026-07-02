/**
 * Static IDOR guard for the portal API route handlers
 * (src/app/api/portal/**). The existing portal-gate-static test covers
 * portal PAGES and server ACTIONS; the raw-bytes / rendered-document API
 * routes are the other client-facing surface and must be held to the same
 * contract:
 *
 *   1. The route gates on a CLIENT session BEFORE its first prisma query —
 *      either requireClientUser() (which throws on staff/unlinked), or an
 *      inline auth() check that rejects a non-CLIENT / clientId-less session.
 *   2. Ownership is enforced against the session's clientId (never an id from
 *      params/body) — the file must reference session.clientId / clientId,
 *      and must NOT expose a record fetched by a bare id without a clientId
 *      check (i.e. no `findUnique({ where: { id } })` unless the file also
 *      scopes/verifies by clientId).
 *
 * Scanning the source means a regression (a new portal API route that
 * queries before gating, or returns a record without an ownership check)
 * fails CI without a live server.
 *
 * Static-scan boundary (documented so future authors don't over-trust it):
 * this reasons only about DIRECT `prisma.<model>.` calls in the route file.
 * A route that delegates its fetch to a service/repo helper, or uses
 * `$queryRaw`/`$transaction`, is not analyzed here — such routes must be
 * covered by a behavioral test instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const PORTAL_API = path.resolve(__dirname, "../src/app/api/portal");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/^route\.(ts|tsx|js)$/.test(entry)) out.push(full);
  }
  return out;
}

function firstIndexOf(src: string, re: RegExp): number {
  const m = re.exec(src);
  return m ? m.index : -1;
}

const routes = existsSync(PORTAL_API) ? walk(PORTAL_API) : [];

describe("portal API routes gate on a CLIENT session and scope by session clientId", () => {
  it("there is at least one portal API route to check", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const file of routes) {
    const rel = path.relative(PORTAL_API, file);
    const src = readFileSync(file, "utf8");

    it(`${rel} gates on a CLIENT session before its first prisma query`, () => {
      const queryIdx = firstIndexOf(src, /prisma\.\w+\.(find|count|aggregate|groupBy|create|update|delete|upsert)/);
      if (queryIdx === -1) return; // no direct query — nothing to leak
      // Accept the shared helpers or an inline CLIENT-role guard (either
      // polarity), so a future route gating differently isn't a false-fail.
      const gateIdx = firstIndexOf(
        src,
        /requireClientUser\s*\(|requirePortalSession\s*\(|role\s*[!=]==\s*["']CLIENT["']/,
      );
      expect(gateIdx, `${rel} must gate on a CLIENT session`).toBeGreaterThanOrEqual(0);
      expect(gateIdx, `${rel} gates AFTER its first query`).toBeLessThan(queryIdx);
    });

    it(`${rel} enforces ownership via the session clientId`, () => {
      expect(src, `${rel} must reference the session clientId for ownership scoping`).toMatch(/clientId/);
    });

    it(`${rel} does not return a record fetched by a bare id without a clientId check`, () => {
      // A findUnique/findFirst whose where opens with the URL `id` — in EITHER
      // form: shorthand `{ id }`/`{ id, … }` OR the canonical `{ id: <param> }`
      // (the common IDOR vector). Allowed ONLY when the file also verifies
      // clientId ownership: a clientId where-clause (scoped query) OR a
      // post-fetch `=== clientId` check OR a portal*Where() builder.
      const bareById = /find(Unique|First)\s*\(\s*\{\s*(?:\n\s*)?where:\s*\{\s*id\s*[,}:]/.test(src);
      if (bareById) {
        expect(src, `${rel} fetches by id — must also check clientId ownership`).toMatch(
          /clientId\s*===|===\s*clientId|clientId\s*:|portal\w*Where\(/,
        );
      }
    });
  }
});
