import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection at the edge. Everything requires a session except
 * the public surface (staff + portal logins, password reset, invite
 * acceptance, portal access request, NextAuth routes, the public
 * lead-intake API, and static assets).
 *
 * ROLE WALL — the portal split is enforced HERE with redirects that
 * RETURN (never layout-only checks, which leak RSC flight payloads):
 *   - role CLIENT may only reach /portal/* and /api/portal/* — every
 *     staff page and staff API is terminally blocked.
 *   - staff roles are bounced out of the authed portal area back to
 *     the staff app.
 * Every portal page ALSO re-checks the session before its first query
 * (requirePortalSession) — defense in depth.
 *
 * Redirects are issued as RELATIVE paths via NextResponse.redirect on
 * the request's own nextUrl clone — Next normalizes middleware
 * redirects, so the Cloudflare-tunnel localhost-host problem that bites
 * Route Handlers does not apply here.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/portal/login",
  "/portal/accept-invite",
  "/portal/request-access",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

/** Paths a CLIENT-role session is allowed to touch. */
function isPortalPath(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/");
}

function redirectTo(req: NextRequest, pathname: string, search = ""): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const opts = {
    req,
    secret: process.env.AUTH_SECRET,
    // next-auth v5 cookie name depends on the scheme of the public URL.
    cookieName:
      process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https")
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
  };
  let token = await getToken(opts).catch(() => null);
  if (!token) {
    // Also try the other cookie variant — local dev over http vs the
    // tunneled https host can disagree with NODE_ENV.
    token = await getToken({ ...opts, cookieName: "authjs.session-token" }).catch(() => null);
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (isPortalPath(pathname)) {
      return redirectTo(req, "/portal/login", `?callbackUrl=${encodeURIComponent(pathname)}`);
    }
    return redirectTo(req, "/login", `?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const role = (token as { role?: string }).role ?? "CSR";

  if (role === "CLIENT") {
    // Portal users never reach staff pages or staff APIs.
    if (!isPortalPath(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return redirectTo(req, "/portal");
    }
  } else if (isPortalPath(pathname)) {
    // Staff have no business in the client portal — keep the surfaces
    // disjoint in both directions.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return redirectTo(req, "/dashboard");
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static files entirely.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)"],
};
