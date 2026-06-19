/**
 * Email transport tests — MIME builder, transport selection, From-header
 * pass-through, and the gmail → resend → log degradation chain (mocked
 * fetch; no real network, no real Google/Resend calls).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import {
  base64Url,
  buildMimeMessage,
  chooseTransport,
  dwdGrantFixMessage,
  emailHealthError,
  gmailFromHeader,
  isProdEnv,
  isUnauthorizedClientError,
  parseFromHeader,
  resetGmailTransportCache,
  sendEmail,
  type EmailMessage,
} from "@/lib/email";
import { resetWorkspaceSaKeyCache } from "@/lib/workspace/sa-key";

// ---------------------------------------------------------------------------
// MIME builder
// ---------------------------------------------------------------------------

function decodeBase64Block(block: string): string {
  return Buffer.from(block.replace(/\r\n/g, ""), "base64").toString("utf8");
}

describe("buildMimeMessage", () => {
  it("builds a text-only message with CRLF endings and base64 body", () => {
    const mime = buildMimeMessage(
      { to: "a@example.com", subject: "Hello", text: "plain body" },
      "Tabor Agency <no-reply@taboragency.com>",
    );
    expect(mime).toContain("From: Tabor Agency <no-reply@taboragency.com>\r\n");
    expect(mime).toContain("To: a@example.com\r\n");
    expect(mime).toContain("Subject: Hello\r\n");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    const body = mime.split("\r\n\r\n")[1];
    expect(decodeBase64Block(body)).toBe("plain body");
    // every line break is CRLF — no bare \n
    expect(mime.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("builds multipart/alternative when both text and html are present", () => {
    const mime = buildMimeMessage(
      { to: ["a@x.com", "b@x.com"], subject: "S", text: "T", html: "<b>H</b>" },
      "no-reply@taboragency.com",
    );
    expect(mime).toContain("To: a@x.com, b@x.com");
    const boundary = /boundary="([^"]+)"/.exec(mime)?.[1];
    expect(boundary).toBeTruthy();
    expect(mime).toContain(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    expect(mime).toContain(`--${boundary}--`);
    const parts = mime.split(`--${boundary}`);
    expect(parts.length).toBe(4); // preamble, text part, html part, terminator
    expect(decodeBase64Block(parts[1].split("\r\n\r\n")[1])).toBe("T");
    expect(decodeBase64Block(parts[2].split("\r\n\r\n")[1])).toBe("<b>H</b>");
  });

  it("html-only message is a single text/html part", () => {
    const mime = buildMimeMessage({ to: "a@x.com", subject: "S", html: "<i>only</i>" }, "f@x.com");
    expect(mime).not.toContain("multipart/alternative");
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(decodeBase64Block(mime.split("\r\n\r\n")[1])).toBe("<i>only</i>");
  });

  it("RFC 2047-encodes non-ASCII subjects", () => {
    const mime = buildMimeMessage({ to: "a@x.com", subject: "Renouvellement — pòlissa", text: "x" }, "f@x.com");
    const subj = /Subject: (.+)\r\n/.exec(mime)?.[1] ?? "";
    expect(subj.startsWith("=?UTF-8?B?")).toBe(true);
    expect(Buffer.from(subj.slice(10, -2), "base64").toString("utf8")).toBe("Renouvellement — pòlissa");
  });

  it("includes Cc, Bcc and Reply-To headers when given", () => {
    const mime = buildMimeMessage(
      { to: "a@x.com", subject: "S", text: "x", cc: "c@x.com", bcc: ["b1@x.com", "b2@x.com"], replyTo: "r@x.com" },
      "f@x.com",
    );
    expect(mime).toContain("Cc: c@x.com\r\n");
    expect(mime).toContain("Bcc: b1@x.com, b2@x.com\r\n");
    expect(mime).toContain("Reply-To: r@x.com\r\n");
  });
});

describe("base64Url", () => {
  it("is RFC 4648 §5: no padding, -_ alphabet", () => {
    const encoded = base64Url(Buffer.from([255, 239, 191, 62, 63]));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toEqual(
      Buffer.from([255, 239, 191, 62, 63]),
    );
  });
});

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

describe("emailHealthError (prod log-only is a misconfiguration)", () => {
  it("is null outside production regardless of transport", () => {
    expect(emailHealthError({ NODE_ENV: "development" })).toBeNull();
    expect(emailHealthError({ NODE_ENV: "test", EMAIL_TRANSPORT: "log" })).toBeNull();
    expect(isProdEnv({ NODE_ENV: "development" })).toBe(false);
  });
  it("flags a log-only transport in production with an actionable message", () => {
    const err = emailHealthError({ NODE_ENV: "production" });
    expect(err).toBeTruthy();
    expect(err).toContain("EMAIL_TRANSPORT");
    expect(isProdEnv({ NODE_ENV: "production" })).toBe(true);
  });
  it("is null in production once a real transport is configured", () => {
    expect(emailHealthError({ NODE_ENV: "production", EMAIL_TRANSPORT: "gmail" })).toBeNull();
    expect(emailHealthError({ NODE_ENV: "production", EMAIL_TRANSPORT: "resend" })).toBeNull();
  });
});

describe("sendEmail log-only transport honesty (prod vs dev)", () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    if (saved === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = saved;
    delete process.env.EMAIL_TRANSPORT;
  });
  it("returns ok=false in production when no real transport is configured (never silently 'sent')", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.EMAIL_TRANSPORT;
    const res = await sendEmail({ to: "c@example.com", subject: "S", text: "T" });
    expect(res.ok).toBe(false);
    expect(res.transport).toBe("log");
  });
  it("still returns ok=true for the log transport in dev", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.EMAIL_TRANSPORT;
    const res = await sendEmail({ to: "c@example.com", subject: "S", text: "T" });
    expect(res).toEqual({ ok: true, transport: "log" });
  });
});

describe("chooseTransport", () => {
  it("selects gmail / resend / log from EMAIL_TRANSPORT", () => {
    expect(chooseTransport({ EMAIL_TRANSPORT: "gmail" })).toBe("gmail");
    expect(chooseTransport({ EMAIL_TRANSPORT: "resend" })).toBe("resend");
    expect(chooseTransport({ EMAIL_TRANSPORT: "log" })).toBe("log");
  });

  it("is case/whitespace tolerant", () => {
    expect(chooseTransport({ EMAIL_TRANSPORT: " GMAIL " })).toBe("gmail");
    expect(chooseTransport({ EMAIL_TRANSPORT: "Resend" })).toBe("resend");
  });

  it("defaults to log when unset or unknown — even with a Resend key present", () => {
    expect(chooseTransport({})).toBe("log");
    expect(chooseTransport({ EMAIL_TRANSPORT: "sendgrid" })).toBe("log");
    expect(chooseTransport({ RESEND_API_KEY: "re_x" })).toBe("log");
  });
});

// ---------------------------------------------------------------------------
// From-header pass-through (psd lesson: Gmail enforces send-as identity)
// ---------------------------------------------------------------------------

describe("parseFromHeader", () => {
  it("parses Name <addr> forms", () => {
    expect(parseFromHeader('"Tabor Agency" <No-Reply@TaborAgency.com>')).toEqual({
      name: "Tabor Agency",
      address: "no-reply@taboragency.com",
    });
    expect(parseFromHeader("Tabor Agency <no-reply@taboragency.com>")).toEqual({
      name: "Tabor Agency",
      address: "no-reply@taboragency.com",
    });
  });

  it("parses a bare address", () => {
    expect(parseFromHeader("no-reply@taboragency.com")).toEqual({ name: null, address: "no-reply@taboragency.com" });
  });

  it("returns null address for unparseable values", () => {
    expect(parseFromHeader("Tabor Agency")).toEqual({ name: "Tabor Agency", address: null });
    expect(parseFromHeader("")).toEqual({ name: null, address: null });
  });
});

describe("gmailFromHeader", () => {
  it("passes the EMAIL_FROM address through — Gmail enforces send-as itself", () => {
    expect(gmailFromHeader("Tabor Agency <no-reply@taboragency.com>", "b@taboragency.com")).toBe(
      "Tabor Agency <no-reply@taboragency.com>",
    );
    expect(gmailFromHeader("no-reply@taboragency.com", "b@taboragency.com")).toBe(
      "Tabor Agency <no-reply@taboragency.com>",
    );
  });

  it("falls back to the impersonated sender when EMAIL_FROM is unparseable or unset", () => {
    expect(gmailFromHeader("Tabor Agency", "b@taboragency.com")).toBe("Tabor Agency <b@taboragency.com>");
    expect(gmailFromHeader(undefined, "b@taboragency.com")).toBe("Tabor Agency <b@taboragency.com>");
  });
});

describe("isUnauthorizedClientError / dwdGrantFixMessage", () => {
  it("classifies DWD auth failures", () => {
    expect(isUnauthorizedClientError(new Error("google token exchange failed: 400 unauthorized_client"))).toBe(true);
    expect(isUnauthorizedClientError(new Error("access_denied"))).toBe(true);
    expect(isUnauthorizedClientError(new Error("fetch failed: ECONNRESET"))).toBe(false);
  });

  it("names the client ID, the scope, and the Admin-console path", () => {
    const msg = dwdGrantFixMessage({ client_email: "sa@p.iam.gserviceaccount.com", client_id: "1135371" }, "b@taboragency.com");
    expect(msg).toContain("1135371");
    expect(msg).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(msg).toContain("Domain-wide Delegation");
    expect(msg).toContain("b@taboragency.com");
  });
});

// ---------------------------------------------------------------------------
// sendEmail end-to-end with mocked fetch (gmail → resend → log chain)
// ---------------------------------------------------------------------------

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const TEST_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

let saSerial = 0;
function installSaKey(): void {
  // Unique client_email per test so google-jwt's process-level token cache
  // never crosses test boundaries.
  saSerial += 1;
  process.env.GOOGLE_WORKSPACE_SA_KEY = JSON.stringify({
    type: "service_account",
    private_key: TEST_PEM,
    client_email: `test-sa-${saSerial}@test-proj.iam.gserviceaccount.com`,
    client_id: "113537149749758563808",
    token_uri: "https://oauth2.googleapis.com/token",
  });
  resetWorkspaceSaKeyCache();
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetchRouter(routes: {
  token?: (call: FetchCall, n: number) => Response;
  gmail?: (call: FetchCall) => Response;
  resend?: (call: FetchCall) => Response;
}): { calls: FetchCall[]; tokenCalls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const tokenCalls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const call = { url, init };
      calls.push(call);
      if (url.includes("oauth2.googleapis.com/token")) {
        tokenCalls.push(call);
        if (routes.token) return routes.token(call, tokenCalls.length);
        return Response.json({ access_token: "tok-1", expires_in: 3600 });
      }
      if (url.includes("gmail.googleapis.com")) {
        if (routes.gmail) return routes.gmail(call);
        return Response.json({ id: "gm-1" });
      }
      if (url.includes("api.resend.com")) {
        if (routes.resend) return routes.resend(call);
        return Response.json({ id: "re-1" });
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );
  return { calls, tokenCalls };
}

function unauthorizedClientResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized_client", error_description: "Client is unauthorized" }), {
    status: 400,
  });
}

const MSG: EmailMessage = { to: "client@example.com", subject: "Policy renewal", text: "Your policy renews soon." };

const ENV_KEYS = [
  "EMAIL_TRANSPORT",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "GMAIL_SENDER_SUBJECT",
  "GOOGLE_WORKSPACE_SA_KEY",
  "GOOGLE_WORKSPACE_SA_KEY_FILE",
] as const;
let savedEnv: Record<string, string | undefined>;

describe("sendEmail (gmail transport, mocked fetch)", () => {
  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.EMAIL_TRANSPORT = "gmail";
    process.env.EMAIL_FROM = "Tabor Agency <no-reply@taboragency.com>";
    process.env.GMAIL_SENDER_SUBJECT = "b@taboragency.com";
    installSaKey();
    resetGmailTransportCache();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    resetWorkspaceSaKeyCache();
    resetGmailTransportCache();
    vi.unstubAllGlobals();
  });

  it("sends via the Gmail API with the EMAIL_FROM address passed through", async () => {
    const { calls, tokenCalls } = mockFetchRouter({});
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "gmail", id: "gm-1" });

    // token minted with gmail.send scope, impersonating the subject
    const tokenBody = String(tokenCalls[0].init?.body);
    const assertion = new URLSearchParams(tokenBody).get("assertion")!;
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64").toString("utf8"));
    expect(claims.scope).toBe("https://www.googleapis.com/auth/gmail.send");
    expect(claims.sub).toBe("b@taboragency.com");

    // raw MIME carries the pass-through From header
    const gmailCall = calls.find((c) => c.url.includes("gmail.googleapis.com"))!;
    expect(String(gmailCall.init?.headers && (gmailCall.init.headers as Record<string, string>).authorization)).toBe(
      "Bearer tok-1",
    );
    const raw = (JSON.parse(String(gmailCall.init?.body)) as { raw: string }).raw;
    const mime = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(mime).toContain("From: Tabor Agency <no-reply@taboragency.com>");
    expect(mime).toContain("To: client@example.com");
  });

  it("uses the impersonated sender in From when EMAIL_FROM is unparseable", async () => {
    process.env.EMAIL_FROM = "Tabor Agency"; // no address
    const { calls } = mockFetchRouter({});
    const res = await sendEmail(MSG);
    expect(res.ok).toBe(true);
    const gmailCall = calls.find((c) => c.url.includes("gmail.googleapis.com"))!;
    const raw = (JSON.parse(String(gmailCall.init?.body)) as { raw: string }).raw;
    const mime = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(mime).toContain("From: Tabor Agency <b@taboragency.com>");
  });

  it("retries with gmail.modify when gmail.send is not in the DWD grant", async () => {
    const { tokenCalls } = mockFetchRouter({
      token: (call, n) => (n === 1 ? unauthorizedClientResponse() : Response.json({ access_token: "tok-2", expires_in: 3600 })),
    });
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "gmail", id: "gm-1" });
    expect(tokenCalls.length).toBe(2);
    const scopeOf = (c: FetchCall) => {
      const assertion = new URLSearchParams(String(c.init?.body)).get("assertion")!;
      return JSON.parse(Buffer.from(assertion.split(".")[1], "base64").toString("utf8")).scope as string;
    };
    expect(scopeOf(tokenCalls[0])).toBe("https://www.googleapis.com/auth/gmail.send");
    expect(scopeOf(tokenCalls[1])).toBe("https://www.googleapis.com/auth/gmail.modify");
  });

  it("falls back to resend when the DWD grant is missing entirely (unauthorized_client on both scopes)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const { calls } = mockFetchRouter({ token: () => unauthorizedClientResponse() });
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "resend", id: "re-1" });
    // never reached the Gmail send endpoint; did reach Resend with EMAIL_FROM intact
    expect(calls.some((c) => c.url.includes("gmail.googleapis.com"))).toBe(false);
    const resendCall = calls.find((c) => c.url.includes("api.resend.com"))!;
    const body = JSON.parse(String(resendCall.init?.body)) as { from: string; to: string[] };
    expect(body.from).toBe("Tabor Agency <no-reply@taboragency.com>");
    expect(body.to).toEqual(["client@example.com"]);
  });

  it("degrades to log-only (ok=false + actionable error) when resend is not configured either", async () => {
    delete process.env.RESEND_API_KEY;
    mockFetchRouter({ token: () => unauthorizedClientResponse() });
    const res = await sendEmail(MSG);
    expect(res.ok).toBe(false);
    expect(res.transport).toBe("gmail");
    expect(res.error).toContain("Domain-wide Delegation");
    expect(res.error).toContain("113537149749758563808");
    expect(res.error).toContain("https://www.googleapis.com/auth/gmail.send");
  });

  it("falls back to resend when the Gmail API answers 403", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const { calls } = mockFetchRouter({
      gmail: () => new Response(JSON.stringify({ error: { code: 403, message: "Delegation denied" } }), { status: 403 }),
    });
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "resend", id: "re-1" });
    expect(calls.some((c) => c.url.includes("gmail.googleapis.com"))).toBe(true);
  });

  it("returns ok=false (never throws) when both gmail 403 and the resend fallback fail", async () => {
    process.env.RESEND_API_KEY = "re_test";
    mockFetchRouter({
      gmail: () => new Response("forbidden", { status: 403 }),
      resend: () => new Response("server error", { status: 500 }),
    });
    const res = await sendEmail(MSG);
    expect(res.ok).toBe(false);
    expect(res.transport).toBe("resend");
    expect(res.error).toContain("500");
  });

  it("falls back to resend when no SA key is configured at all", async () => {
    delete process.env.GOOGLE_WORKSPACE_SA_KEY;
    resetWorkspaceSaKeyCache();
    process.env.RESEND_API_KEY = "re_test";
    const { calls } = mockFetchRouter({});
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "resend", id: "re-1" });
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com"))).toBe(false);
  });

  it("memoizes the working scope — second send does a single cached-token path", async () => {
    const { tokenCalls } = mockFetchRouter({
      token: (call, n) => (n === 1 ? unauthorizedClientResponse() : Response.json({ access_token: "tok-2", expires_in: 3600 })),
    });
    await sendEmail(MSG);
    expect(tokenCalls.length).toBe(2); // send → unauthorized, modify → ok
    await sendEmail(MSG);
    expect(tokenCalls.length).toBe(2); // token cached for the modify scope; no new mints
  });

  it("resend transport stays untouched when EMAIL_TRANSPORT=resend", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    process.env.RESEND_API_KEY = "re_test";
    const { calls } = mockFetchRouter({});
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "resend", id: "re-1" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("api.resend.com");
  });

  it("log transport stays the default and sends nothing", async () => {
    delete process.env.EMAIL_TRANSPORT;
    const { calls } = mockFetchRouter({});
    const res = await sendEmail(MSG);
    expect(res).toEqual({ ok: true, transport: "log" });
    expect(calls.length).toBe(0);
  });
});
