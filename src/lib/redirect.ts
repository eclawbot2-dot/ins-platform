import { NextResponse } from "next/server";

/**
 * Open-redirect defense. Only accepts same-origin relative paths.
 * Rejects:
 *   - empty / non-leading-slash strings
 *   - protocol-relative `//evil.com` and `/\evil.com`
 *   - `javascript:` and other smuggled schemes
 */
export function isSafeRedirect(url: string): boolean {
  if (!url) return false;
  if (url[0] !== "/") return false;
  if (url[1] === "/" || url[1] === "\\") return false;
  if (/^[^/]*:/.test(url.replace(/^\//, ""))) return false;
  return true;
}

/**
 * Proxy-safe in-app redirect (303 See Other by default).
 *
 * This app runs behind a Cloudflare tunnel (public ins-app.jahdev.com ->
 * localhost:3220). Inside a Route Handler, `req.url`'s host is the
 * INTERNAL origin, and `NextResponse.redirect(new URL(path, req.url))`
 * serializes that absolute URL into the `Location` header — sending the
 * browser to https://localhost:3220/... and breaking the navigation.
 *
 * Emitting a RELATIVE `Location` sidesteps the internal host entirely:
 * per RFC 7231 the browser resolves a relative `Location` against the
 * public URL it actually requested.
 */
export function appRedirect(path: string, status: 302 | 303 | 307 = 303): NextResponse {
  const safe = isSafeRedirect(path) ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}
