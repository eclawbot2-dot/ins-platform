/**
 * Smoke test — logs in as the seeded admin and verifies every nav page
 * renders (HTTP 200 + a content marker), plus CSV exports and the
 * public lead-intake API. Run against a server already listening:
 *
 *   node scripts/smoke.mjs [baseUrl]   (default http://localhost:3220)
 *
 * Staff credentials come from SMOKE_EMAIL / SMOKE_PASSWORD. The seed
 * intentionally RANDOMIZES the admin password (unless SEED_ADMIN_PASSWORD
 * was set), so there is no hardcoded default that works against a live
 * database — without env creds the staff checks fail with the hint below.
 */

const BASE = process.argv[2] ?? "http://localhost:3220";
const EMAIL = process.env.SMOKE_EMAIL ?? "b@taboragency.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "";
if (!process.env.SMOKE_PASSWORD) {
  console.log(
    "WARN  SMOKE_PASSWORD not set — the seeded admin password is randomized, so staff-surface " +
      "checks will fail. Set SMOKE_EMAIL/SMOKE_PASSWORD to a real staff login.",
  );
}

const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (value === "" || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
}
function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...init,
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  storeCookies(res);
  return res;
}

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
}

// 1. Login via NextAuth credentials.
const csrfRes = await req("/api/auth/csrf");
const { csrfToken } = await csrfRes.json();
const loginRes = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/dashboard` }),
});
const hasSession = Array.from(jar.keys()).some((k) => k.includes("session-token"));
check("login (credentials callback)", loginRes.status === 302 && hasSession, `status ${loginRes.status}`);

// 2. Every nav page renders with data.
const pages = [
  ["/dashboard", "Book premium"],
  ["/tasks", "task"],
  ["/clients", "Harborview"],
  ["/households", "household"],
  // Search-scoped so the seed lead is found regardless of how many other
  // leads exist (the list paginates; a bare /leads can bury a seed row).
  ["/leads?q=Thompson", "Thompson"],
  ["/opportunities", "Edit details"],
  ["/policies", "Travelers"],
  ["/quotes", "Quot"],
  ["/renewals", "Renewal"],
  ["/renewals/xdates", "X-date"],
  ["/claims", "CLM-"],
  ["/certificates", "COI-"],
  ["/certificates/holders", "Meridian"],
  ["/eoi", "Evidence of Property"],
  ["/eoi/new", "evidence of property"],
  ["/carriers", "Progressive"],
  ["/markets", "Market finder"],
  ["/signatures", "signature"],
  ["/documents", "declarations"],
  ["/commissions", "statement"],
  ["/commissions/payables", "payable"],
  ["/accounting", "INV-"],
  ["/compliance", "license"],
  ["/compliance/surplus-lines", "Surplus-lines"],
  ["/team", "Mitchell"],
  ["/marketing", "referral"],
  ["/reports", "Book of business"],
  ["/reports/book", "Travelers"],
  ["/reports/production", "Producer"],
  ["/reports/retention", "Retention"],
  ["/reports/trend", "renewal"],
  ["/reports/commissions", "Commission"],
  ["/reports/funnel", "funnel"],
  ["/reports/loss-ratio", "Loss ratio"],
  ["/reports/cross-sell", "Cross-sell"],
  ["/reports/at-risk", "At-risk"],
  ["/settings", "Agency profile"],
  ["/settings/integrations", "Xero"],
  ["/settings/templates", "renewal-notice"],
  ["/settings/keys", "intake"],
  ["/settings/audit", "Audit"],
];
for (const [path, marker] of pages) {
  const res = await req(path);
  const body = res.status === 200 ? await res.text() : "";
  const found = body.toLowerCase().includes(marker.toLowerCase());
  check(`GET ${path}`, res.status === 200 && found, `status ${res.status}${found ? "" : `, marker "${marker}" missing`}`);
}

// 3. CSV exports.
for (const path of [
  "/api/reports/book?by=carrier",
  "/api/reports/production",
  "/api/reports/payables",
  "/api/reports/lead-roi",
  "/api/reports/loss-ratio?by=carrier",
  "/api/reports/loss-ratio?by=lob",
  "/api/reports/cross-sell",
  "/api/reports/at-risk",
]) {
  const res = await req(path);
  const text = res.status === 200 ? await res.text() : "";
  check(`CSV ${path}`, res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/csv") && text.length > 10);
}

// 3b. Servicing artifacts (Wave B).
{
  // An auto policy ID card renders printable HTML for staff.
  const list = await req("/policies?q=PA-");
  const id = (await list.text()).match(/href="\/policies\/(c[a-z0-9]{15,})"/)?.[1];
  if (id) {
    const card = await req(`/api/documents/id-card/${id}`);
    // Auto policies render the card; non-auto would 404 — try a few until one hits.
    let ok = card.status === 200 && (await card.text()).includes("IDENTIFICATION CARD");
    if (!ok) {
      const ids = [...(await (await req("/policies?q=PA-")).text()).matchAll(/href="\/policies\/(c[a-z0-9]{15,})"/g)].map((m) => m[1]);
      for (const pid of ids) {
        const r = await req(`/api/documents/id-card/${pid}`);
        if (r.status === 200 && (await r.text()).includes("IDENTIFICATION CARD")) { ok = true; break; }
      }
    }
    check("auto ID card renders printable HTML", ok);
  } else {
    check("auto ID card renders printable HTML", false, "no auto policy link found");
  }

  // The EOI detail page renders the seeded evidence of property.
  const eoiList = await req("/eoi");
  const eoiId = (await eoiList.text()).match(/href="\/eoi\/(c[a-z0-9]{15,})"/)?.[1];
  if (eoiId) {
    const eoi = await req(`/eoi/${eoiId}`);
    const body = eoi.status === 200 ? await eoi.text() : "";
    check("EOI detail renders", eoi.status === 200 && body.includes("EVIDENCE OF PROPERTY INSURANCE"));
  } else {
    check("EOI detail renders", false, "no EOI link found");
  }

  // A cancelled policy detail offers the Reinstate action.
  const cancList = await req("/policies?q=PA-LIB");
  const cancIds = [...(await cancList.text()).matchAll(/href="\/policies\/(c[a-z0-9]{15,})"/g)].map((m) => m[1]);
  let reinstateOk = false;
  for (const pid of cancIds) {
    const body = await (await req(`/policies/${pid}`)).text();
    if (body.includes("Reinstate policy")) { reinstateOk = true; break; }
  }
  check("cancelled policy shows Reinstate action", reinstateOk, cancIds.length ? "" : "no PA-LIB policy found");

  // A policy detail surfaces the endorsement-request workflow.
  const erList = await req("/policies?q=CA-PRO");
  const erIds = [...(await erList.text()).matchAll(/href="\/policies\/(c[a-z0-9]{15,})"/g)].map((m) => m[1]);
  let erOk = false;
  for (const pid of erIds) {
    const body = await (await req(`/policies/${pid}`)).text();
    if (body.includes("Endorsement requests")) { erOk = true; break; }
  }
  check("policy detail shows endorsement requests", erOk, erIds.length ? "" : "no CA-PRO policy found");
}

// 4. Detail pages (first real record of each list).
for (const [list, pattern] of [
  ["/policies", /href="\/policies\/(c[a-z0-9]{15,})"/],
  ["/clients", /href="\/clients\/(c[a-z0-9]{15,})"/],
  ["/certificates", /href="\/certificates\/(c[a-z0-9]{15,})"/],
  ["/commissions", /href="\/commissions\/(c[a-z0-9]{15,})"/],
  ["/accounting", /href="\/accounting\/(c[a-z0-9]{15,})"/],
  ["/claims", /href="\/claims\/(c[a-z0-9]{15,})"/],
]) {
  const listRes = await req(list);
  const id = (await listRes.text()).match(pattern)?.[1];
  if (!id) { check(`detail ${list}/[id]`, false, "no record link found"); continue; }
  const res = await req(`${list}/${id}`);
  check(`GET ${list}/${id.slice(0, 8)}…`, res.status === 200);
}

// 4b. Coverage schedule renders on a policy detail page (Wave A).
// A seeded GL policy carries an "Each occurrence" coverage; scan the
// GL-HAR matches (the RENEWED predecessor has none, the ACTIVE term
// does) until one detail page shows the populated schedule.
{
  const list = await req("/policies?q=GL-HAR");
  const ids = [...(await list.text()).matchAll(/href="\/policies\/(c[a-z0-9]{15,})"/g)].map((m) => m[1]);
  let ok = false;
  for (const id of ids) {
    const body = await (await req(`/policies/${id}`)).text();
    if (body.includes("Coverage schedule") && body.toLowerCase().includes("each occurrence")) { ok = true; break; }
  }
  check("policy detail shows coverage schedule", ok, ids.length ? "" : "no GL policy link found");
}

// 4c. Client 360 surfaces the X-dates capture card.
{
  const list = await req("/clients");
  const id = (await list.text()).match(/href="\/clients\/(c[a-z0-9]{15,})"/)?.[1];
  const body = id ? await (await req(`/clients/${id}`)).text() : "";
  check("client 360 shows X-dates card", body.includes("X-dates"));
  check("client 360 shows communication timeline + preferences", body.includes("Communication timeline") && body.includes("Communication preferences"));
}

// 4d. Touchpoint engine — staff dashboard + journeys + dry-run cron.
{
  const dash = await req("/touchpoints");
  const dashBody = dash.status === 200 ? await dash.text() : "";
  check("GET /touchpoints", dash.status === 200 && dashBody.includes("Needs approval"), `status ${dash.status}`);

  const tpls = await req("/touchpoints/templates");
  const tplBody = tpls.status === 200 ? await tpls.text() : "";
  check("GET /touchpoints/templates", tpls.status === 200 && tplBody.includes("onboard-welcome"), `status ${tpls.status}`);

  // Cron route: dryRun=1 counts due but sends nothing. Needs the CRON_KEY.
  const cronKey = process.env.CRON_KEY;
  if (cronKey) {
    const dry = await fetch(`${BASE}/api/cron/touchpoints?dryRun=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-key": cronKey },
      body: "{}",
    });
    const dryJson = dry.status === 200 ? await dry.json() : {};
    check(
      "POST /api/cron/touchpoints?dryRun=1 (counts due, sends nothing)",
      dry.status === 200 && dryJson.ok === true && dryJson.dryRun === true && dryJson.send?.sent === 0,
      `status ${dry.status}`,
    );
    // A wrong key is rejected.
    const bad = await fetch(`${BASE}/api/cron/touchpoints?dryRun=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-key": "wrong" },
      body: "{}",
    });
    check("cron route rejects bad X-Cron-Key", bad.status === 401, `status ${bad.status}`);
  } else {
    check("cron dry-run (skipped — CRON_KEY not in env)", true);
  }
}

// 5. Public lead intake (keyed) + auth rejection.
const badLead = await fetch(`${BASE}/api/public/leads`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-lead-key": "wrong-key" },
  body: JSON.stringify({ firstName: "No", lastName: "Key" }),
});
check("public leads rejects bad key", badLead.status === 401);
const goodLead = await fetch(`${BASE}/api/public/leads`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-lead-key": "ins-lead-intake-2026" },
  body: JSON.stringify({
    firstName: "Smoke",
    lastName: "Test",
    email: "smoke@example.com",
    phone: "843-555-0999",
    zip: "29401",
    lineOfBusiness: "HOME",
    message: "Smoke-test lead from scripts/smoke.mjs — safe to delete.",
    source: "website",
  }),
});
const leadJson = goodLead.status === 201 ? await goodLead.json() : {};
check("public leads accepts valid key", goodLead.status === 201 && leadJson.ok === true, `score ${leadJson.score}`);

// 5b. AI Compare / coverage-checkup — staff tool + public surfaces.
{
  // Staff coverage-analysis tool renders with the seeded submission queue
  // + the analyzed-with-gaps detail page (a real gap report).
  const tool = await req("/tools/coverage-analysis");
  const toolBody = tool.status === 200 ? await tool.text() : "";
  check(
    "GET /tools/coverage-analysis",
    tool.status === 200 && toolBody.includes("Coverage analysis") && toolBody.includes("Coverage-checkup submissions"),
    `status ${tool.status}`,
  );
  const analysisId = toolBody.match(/href="\/tools\/coverage-analysis\/(c[a-z0-9]{15,})"/)?.[1];
  if (analysisId) {
    const detail = await req(`/tools/coverage-analysis/${analysisId}`);
    const detailBody = detail.status === 200 ? await detail.text() : "";
    // At least one of the seeded ANALYZED rows shows the gap report.
    const ids = [...toolBody.matchAll(/href="\/tools\/coverage-analysis\/(c[a-z0-9]{15,})"/g)].map((m) => m[1]);
    let gapOk = detail.status === 200 && detailBody.includes("Coverage gaps");
    if (!gapOk) {
      for (const id of ids) {
        const b = await (await req(`/tools/coverage-analysis/${id}`)).text();
        if (b.includes("Coverage gaps") || b.includes("No significant gaps")) { gapOk = true; break; }
      }
    }
    check("staff coverage-analysis detail shows a gap report", gapOk);
  } else {
    check("staff coverage-analysis detail shows a gap report", false, "no analysis link found");
  }
}

// 5c. Public /compare landing + /coverage-checkup alias (anonymous, no login).
{
  const cmp = await fetch(`${BASE}/compare`, { redirect: "manual" });
  const cmpBody = cmp.status === 200 ? await cmp.text() : "";
  check("GET /compare (anonymous, 200)", cmp.status === 200 && cmpBody.includes("Coverage Checkup"), `status ${cmp.status}`);
  const alias = await fetch(`${BASE}/coverage-checkup`, { redirect: "manual" });
  check("GET /coverage-checkup alias (anonymous, 200)", alias.status === 200, `status ${alias.status}`);

  // Degraded-mode public submission: multipart with pasted details + honeypot empty.
  const fd = new FormData();
  fd.set("name", "Smoke Compare");
  fd.set("email", "smoke-compare@example.com");
  fd.set("lineOfBusiness", "AUTO");
  fd.set("details", "Auto policy, 50/100 BI, no UM, $500 comp/collision. Smoke-test — safe to delete.");
  const sub = await fetch(`${BASE}/api/public/compare`, { method: "POST", body: fd });
  const subJson = sub.status === 201 ? await sub.json() : {};
  check(
    "POST /api/public/compare creates an analysis (degraded → PENDING/MANUAL_REVIEW) + lead",
    sub.status === 201 && subJson.ok === true && typeof subJson.analysisId === "string" &&
      ["PENDING", "MANUAL_REVIEW", "ANALYZED"].includes(subJson.status),
    `status ${sub.status} → ${subJson.status}`,
  );
  // Honeypot trips → silent 200, no analysis.
  const hp = new FormData();
  hp.set("name", "Bot");
  hp.set("website", "http://spam.example");
  hp.set("details", "spam");
  const hpRes = await fetch(`${BASE}/api/public/compare`, { method: "POST", body: hp });
  check("public compare honeypot silently accepts (200)", hpRes.status === 200, `status ${hpRes.status}`);

  // Magic-byte guard: bytes declaring application/pdf but NOT a real PDF
  // (here an "MZ" exe header) are rejected 415 — declared type can't be trusted.
  const spoof = new FormData();
  spoof.set("name", "Spoof Upload");
  spoof.set("email", "spoof@example.com");
  const fakePdf = new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], { type: "application/pdf" });
  spoof.set("file", fakePdf, "policy.pdf");
  const spoofRes = await fetch(`${BASE}/api/public/compare`, { method: "POST", body: spoof });
  check("public compare rejects a spoofed-type file (415)", spoofRes.status === 415, `status ${spoofRes.status}`);

  // The public results page renders for the just-created analysis.
  if (subJson.analysisId) {
    const result = await fetch(`${BASE}/compare/${subJson.analysisId}`, { redirect: "manual" });
    const rBody = result.status === 200 ? await result.text() : "";
    check(
      "GET /compare/[id] public results page (anonymous, 200)",
      result.status === 200 && rBody.toLowerCase().includes("coverage report"),
      `status ${result.status}`,
    );
  } else {
    check("GET /compare/[id] public results page (anonymous, 200)", false, "no analysisId");
  }
}

// 6. Unauthed page redirects to login.
const anon = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
check("anonymous /dashboard redirects", anon.status === 307 || anon.status === 302);

// 7. While still STAFF: the portal area bounces staff back to the app.
const staffPortal = await req("/portal", {});
check(
  "staff is bounced out of /portal",
  (staffPortal.status === 307 || staffPortal.status === 302) &&
    (staffPortal.headers.get("location") ?? "").includes("/dashboard"),
  `status ${staffPortal.status} → ${staffPortal.headers.get("location")}`,
);

// ── Client portal ────────────────────────────────────────────────────
const PORTAL_EMAIL = "client@taboragency.com";
const PORTAL_PASSWORD = "Client2026!";

// 8. Portal public surface (anonymous).
jar.clear();
for (const [path, marker] of [
  ["/portal/login", "Tabor Agency"],
  ["/portal/request-access", "Request portal access"],
]) {
  const res = await req(path);
  const body = res.status === 200 ? await res.text() : "";
  check(`GET ${path} (anonymous)`, res.status === 200 && body.includes(marker), `status ${res.status}`);
}
const anonPortal = await fetch(`${BASE}/portal/policies`, { redirect: "manual" });
check(
  "anonymous /portal/* redirects to portal login",
  (anonPortal.status === 307 || anonPortal.status === 302) &&
    (anonPortal.headers.get("location") ?? "").includes("/portal/login"),
);

// Unsubscribe is token-authed and needs NO login (CAN-SPAM one-click).
{
  const u = await fetch(`${BASE}/unsubscribe?token=smoke-unknown-token`, { redirect: "manual" });
  const body = u.status === 200 ? await u.text() : "";
  check(
    "GET /unsubscribe?token=… renders without login (200)",
    u.status === 200 && body.includes("preferences"),
    `status ${u.status}`,
  );
}

// 9. Portal login (seeded CLIENT user).
const pCsrf = await (await req("/api/auth/csrf")).json();
const pLogin = await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: pCsrf.csrfToken,
    email: PORTAL_EMAIL,
    password: PORTAL_PASSWORD,
    callbackUrl: `${BASE}/portal`,
  }),
});
check(
  "portal login (credentials callback)",
  pLogin.status === 302 && Array.from(jar.keys()).some((k) => k.includes("session-token")),
  `status ${pLogin.status}`,
);

// 10. Portal pages render with the seeded client's data.
for (const [path, marker] of [
  ["/portal", "Active policies"],
  ["/portal/policies", "General Liability"],
  ["/portal/checkup", "Coverage checkup"],
  ["/portal/documents", "harborview"],
  ["/portal/invoices", "INV-"],
  ["/portal/claims", "CLM-"],
  ["/portal/claims/new", "Date of loss"],
  ["/portal/certificates", "Certificate holder name"],
  ["/portal/preferences", "Email preferences"],
  ["/portal/profile", "Harborview"],
]) {
  const res = await req(path);
  const body = res.status === 200 ? await res.text() : "";
  const found = body.toLowerCase().includes(marker.toLowerCase());
  check(`GET ${path} (client)`, res.status === 200 && found, `status ${res.status}${found ? "" : `, marker "${marker}" missing`}`);
}

// 10b. Portal policy detail shows the read-only coverage schedule (Wave A)
// + the structured endorsement-request form (Wave B).
{
  const list = await req("/portal/policies");
  const id = (await list.text()).match(/href="\/portal\/policies\/(c[a-z0-9]{15,})"/)?.[1];
  const body = id ? await (await req(`/portal/policies/${id}`)).text() : "";
  check(
    "portal policy detail shows coverage schedule",
    body.includes("Coverage schedule"),
    id ? "" : "no portal policy link found",
  );
  check("portal policy detail offers a structured change request", body.includes("Request a policy change"));
}

// 10c. Portal coverage checkup — the seeded CLIENT_PORTAL analysis renders
// a scoped report with the "request a review" CTA.
{
  const list = await req("/portal/checkup");
  const listBody = list.status === 200 ? await list.text() : "";
  const id = listBody.match(/href="\/portal\/checkup\/(c[a-z0-9]{15,})"/)?.[1];
  if (id) {
    const result = await req(`/portal/checkup/${id}`);
    const rBody = result.status === 200 ? await result.text() : "";
    check(
      "portal checkup result renders a coverage report",
      result.status === 200 && rBody.toLowerCase().includes("coverage report") && rBody.includes("Request a coverage review"),
      `status ${result.status}`,
    );
  } else {
    check("portal checkup result renders a coverage report", false, "no portal checkup link found");
  }
}

// 11. Role wall: a CLIENT session is terminally blocked from staff surfaces.
const clientDash = await req("/dashboard");
check(
  "CLIENT blocked from /dashboard (redirect to /portal)",
  (clientDash.status === 307 || clientDash.status === 302) &&
    (clientDash.headers.get("location") ?? "").includes("/portal"),
  `status ${clientDash.status} → ${clientDash.headers.get("location")}`,
);
for (const path of ["/clients", "/policies", "/settings"]) {
  const res = await req(path);
  check(`CLIENT blocked from ${path}`, res.status === 307 || res.status === 302, `status ${res.status}`);
}
const clientApi = await req("/api/reports/book?by=carrier");
check("CLIENT blocked from staff API (403)", clientApi.status === 403, `status ${clientApi.status}`);

// 12. Portal document download is scoped + opt-in.
const docsPage = await req("/portal/documents");
const docId = (await docsPage.text()).match(/\/api\/portal\/documents\/(c[a-z0-9]{15,})/)?.[1];
if (docId) {
  const dl = await req(`/api/portal/documents/${docId}`);
  check("portal document download", dl.status === 200, `status ${dl.status}`);
} else {
  check("portal document download", false, "no shared document link found");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
