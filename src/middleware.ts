import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection at the edge. Everything requires a session except
 * the public surface (login, password reset, NextAuth routes, the
 * public lead-intake API, and static assets).
 *
 * Redirects are issued as RELATIVE paths via NextResponse.redirect on
 * the request's own nextUrl clone — Next normalizes middleware
 * redirects, so the Cloudflare-tunnel localhost-host problem that bites
 * Route Handlers does not apply here.
 */

const PUBLIC_PATHS = new Set(["/login", "/forgot-password", "/reset-password"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    // next-auth v5 cookie name depends on the scheme of the public URL.
    cookieName:
      process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https")
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
  }).catch(() => null);

  if (!token) {
    // Also try the other cookie variant — local dev over http vs the
    // tunneled https host can disagree with NODE_ENV.
    const alt = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName: "authjs.session-token",
    }).catch(() => null);
    if (!alt) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static files entirely.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)"],
};
