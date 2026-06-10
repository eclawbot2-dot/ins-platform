/**
 * The app's canonical PUBLIC base URL (https://ins-app.jahdev.com),
 * with any trailing slash stripped.
 *
 * Behind the Cloudflare tunnel a Route Handler's `req.url` / `url.origin`
 * resolves to the INTERNAL origin (localhost:3220), so anything that
 * must be correct off-host — OAuth `redirect_uri`s round-tripped through
 * a provider, links emailed to users — must be built from this
 * configured value, NEVER from the request origin.
 */
export function appBaseUrl(): string {
  const raw =
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "";
  return raw.replace(/\/+$/, "");
}
