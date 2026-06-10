/**
 * Xero OAuth2 — authorize URL, code exchange, token refresh, tenant
 * discovery. Ported from gcon's integration framework, simplified to a
 * single agency-wide connection.
 *
 * Env: XERO_CLIENT_ID, XERO_CLIENT_SECRET. Redirect URI is built from
 * APP_URL (NEVER req.url — behind the CF tunnel req.url is localhost).
 *
 * Without credentials, isXeroConfigured() is false and the Settings
 * page shows setup instructions instead of a connect button.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/app-url";
import { captureException } from "@/lib/log";
import { decryptToken, encryptToken } from "@/lib/integrations/crypto";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_SCOPES =
  "offline_access accounting.transactions accounting.contacts accounting.settings.read";

export function isXeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function xeroRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/xero/callback`;
}

export function buildXeroAuthUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.XERO_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", xeroRedirectUri());
  url.searchParams.set("scope", XERO_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function generateOauthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export async function exchangeXeroCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: xeroRedirectUri(),
    client_id: process.env.XERO_CLIENT_ID ?? "",
    client_secret: process.env.XERO_CLIENT_SECRET ?? "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`xero token exchange failed ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Return a usable access token for the connection, auto-refreshing when
 * the saved expiry is within 5 minutes. Throws when refresh fails.
 */
export async function getXeroAccessToken(connectionId: string): Promise<string> {
  const conn = await prisma.integrationConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error(`connection ${connectionId} not found`);

  const expiresAt = conn.expiresAt?.getTime() ?? 0;
  const needsRefresh = expiresAt === 0 || expiresAt - Date.now() < REFRESH_THRESHOLD_MS;
  const accessTokenPlain = decryptToken(conn.accessTokenEnc);
  if (!needsRefresh && accessTokenPlain) return accessTokenPlain;

  const refreshPlain = decryptToken(conn.refreshTokenEnc);
  if (!refreshPlain) throw new Error("no refresh token; reconnect required");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshPlain,
    client_id: process.env.XERO_CLIENT_ID ?? "",
    client_secret: process.env.XERO_CLIENT_SECRET ?? "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: { status: "TOKEN_EXPIRED", lastSyncNote: `refresh failed: ${res.status}` },
    });
    throw new Error(`xero refresh ${res.status}`);
  }
  const json = (await res.json()) as TokenResponse;
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      accessTokenEnc: encryptToken(json.access_token),
      refreshTokenEnc: json.refresh_token ? encryptToken(json.refresh_token) : conn.refreshTokenEnc,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : conn.expiresAt,
      status: "CONNECTED",
    },
  });
  return json.access_token;
}

/**
 * Resolve the Xero tenant id for a connection — calls GET /connections
 * once and caches the result on the row.
 */
export async function ensureXeroTenant(connectionId: string): Promise<string | null> {
  const conn = await prisma.integrationConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.provider !== "XERO") return null;
  if (conn.xeroTenantId) return conn.xeroTenantId;

  try {
    const accessToken = await getXeroAccessToken(connectionId);
    const res = await fetch("https://api.xero.com/connections", {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`xero /connections ${res.status}`);
    const arr = (await res.json()) as Array<{ tenantId: string; tenantName?: string }>;
    const first = arr[0];
    if (!first) throw new Error("no xero tenants on connection");
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: { xeroTenantId: first.tenantId, organisation: first.tenantName ?? null },
    });
    return first.tenantId;
  } catch (err) {
    captureException(err, { module: "integrations/xero/auth", connectionId });
    return null;
  }
}

export function xeroHeaders(accessToken: string, xeroTenantId: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "xero-tenant-id": xeroTenantId,
    accept: "application/json",
    "content-type": "application/json",
  };
}
