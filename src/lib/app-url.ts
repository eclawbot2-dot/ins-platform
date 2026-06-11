/**
 * The app's canonical PUBLIC base URL (https://ins.jahdev.com),
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

/**
 * Base URL used in CLIENT-facing emails/links (portal invites etc.).
 * The portal is reachable on two hostnames — ins.jahdev.com and
 * portal.taboragency.com — and PORTAL_URL picks which one we put in
 * front of customers. Falls back to the staff base URL.
 */
export function portalBaseUrl(): string {
  const raw = process.env.PORTAL_URL ?? "";
  return raw ? raw.replace(/\/+$/, "") : appBaseUrl();
}
