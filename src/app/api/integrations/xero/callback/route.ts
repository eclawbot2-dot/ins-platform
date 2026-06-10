import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { captureException } from "@/lib/log";
import { encryptToken } from "@/lib/integrations/crypto";
import { ensureXeroTenant, exchangeXeroCode } from "@/lib/integrations/xero/auth";
import { appRedirect } from "@/lib/redirect";

/**
 * Xero OAuth callback — verifies state, exchanges the code, persists
 * the (single) agency-wide connection with encrypted tokens, and
 * resolves the tenant. All redirects are RELATIVE (tunnel rule).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.userId) return appRedirect("/login");
  if (session.role !== "ADMIN") {
    return appRedirect(`/settings/integrations?toastError=${encodeURIComponent("Admin access required")}`);
  }

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  const jar = await cookies();
  const expectedState = jar.get("xero_oauth_state")?.value;
  jar.delete("xero_oauth_state");

  if (error) {
    return appRedirect(`/settings/integrations?toastError=${encodeURIComponent(`Xero: ${error}`)}`);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return appRedirect(`/settings/integrations?toastError=${encodeURIComponent("Xero: state mismatch — try again")}`);
  }

  try {
    const tokens = await exchangeXeroCode(code);
    // Single agency-wide connection: replace any existing Xero rows.
    await prisma.integrationConnection.deleteMany({ where: { provider: "XERO" } });
    const conn = await prisma.integrationConnection.create({
      data: {
        provider: "XERO",
        status: "CONNECTED",
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        scope: tokens.scope ?? null,
      },
    });
    await ensureXeroTenant(conn.id);
    await audit({ userId: session.userId, action: "XERO_CONNECT", entityType: "IntegrationConnection", entityId: conn.id });
    return appRedirect(`/settings/integrations?toast=${encodeURIComponent("Xero connected")}`);
  } catch (err) {
    captureException(err, { module: "integrations/xero/callback" });
    return appRedirect(
      `/settings/integrations?toastError=${encodeURIComponent("Xero connection failed — check credentials and try again")}`,
    );
  }
}
