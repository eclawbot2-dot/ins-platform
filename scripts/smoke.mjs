/**
 * Smoke test — logs in as the seeded admin and verifies every nav page
 * renders (HTTP 200 + a content marker), plus CSV exports and the
 * public lead-intake API. Run against a server already listening:
 *
 *   node scripts/smoke.mjs [baseUrl]   (default http://localhost:3220)
 */

const BASE = process.argv[2] ?? "http://localhost:3220";
const EMAIL = "ericbbowman2@gmail.com";
const PASSWORD = "Ins2026!";

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
  ["/leads", "Thompson"],
  ["/opportunities", "Pipeline"],
  ["/policies", "Travelers"],
  ["/quotes", "Quot"],
  ["/renewals", "Renewal"],
  ["/claims", "CLM-"],
  ["/certificates", "COI-"],
  ["/certificates/holders", "Meridian"],
  ["/carriers", "Progressive"],
  ["/documents", "declarations"],
  ["/commissions", "statement"],
  ["/commissions/payables", "payable"],
  ["/accounting", "INV-"],
  ["/compliance", "license"],
  ["/team", "Mitchell"],
  ["/marketing", "referral"],
  ["/reports", "Book of business"],
  ["/reports/book", "Travelers"],
  ["/reports/production", "Producer"],
  ["/reports/retention", "Retention"],
  ["/reports/trend", "renewal"],
  ["/reports/commissions", "Commission"],
  ["/reports/funnel", "funnel"],
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
for (const path of ["/api/reports/book?by=carrier", "/api/reports/production", "/api/reports/payables", "/api/reports/lead-roi"]) {
  const res = await req(path);
  const text = res.status === 200 ? await res.text() : "";
  check(`CSV ${path}`, res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/csv") && text.length > 10);
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

// 6. Unauthed page redirects to login.
const anon = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
check("anonymous /dashboard redirects", anon.status === 307 || anon.status === 302);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
