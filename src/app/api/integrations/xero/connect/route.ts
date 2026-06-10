import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { buildXeroAuthUrl, generateOauthState, isXeroConfigured } from "@/lib/integrations/xero/auth";
import { appRedirect } from "@/lib/redirect";

/**
 * Start the Xero OAuth flow. Admin-only. The CSRF state rides in an
 * httpOnly cookie and is verified in the callback.
 */
export async function GET() {
  const session = await auth();
  if (!session?.userId) return appRedirect("/login");
  if (session.role !== "ADMIN") {
    return appRedirect(`/settings/integrations?toastError=${encodeURIComponent("Admin access required")}`);
  }
  if (!isXeroConfigured()) {
    return appRedirect(
      `/settings/integrations?toastError=${encodeURIComponent("Set XERO_CLIENT_ID / XERO_CLIENT_SECRET first")}`,
    );
  }

  const state = generateOauthState();
  const jar = await cookies();
  jar.set("xero_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600,
    path: "/",
  });

  // External absolute redirect — Xero's own origin, not ours, so the
  // tunnel localhost-host problem does not apply.
  return NextResponse.redirect(buildXeroAuthUrl(state), 302);
}
