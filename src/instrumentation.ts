/**
 * Next.js startup hook (runs once per server process). Used for boot-time
 * health assertions that should fail loudly rather than degrade silently.
 *
 * Currently: assert a real email transport is configured in production. A
 * log-only transport in prod means every outbound email is silently dropped
 * (touchpoints, password resets, receipts) — surface it at boot in the logs.
 */
export async function register(): Promise<void> {
  // Node runtime only — the email transport pulls in Node APIs.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  const { emailHealthError } = await import("@/lib/email");
  const { log } = await import("@/lib/log");

  const emailIssue = emailHealthError();
  if (emailIssue) {
    log.error(`startup health: ${emailIssue}`, { module: "startup" });
  }
}
