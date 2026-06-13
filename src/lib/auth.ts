import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

const config: NextAuthConfig = {
  session: {
    strategy: "jwt",
    // 8-hour bound: a full workday, then re-auth.
    maxAge: 60 * 60 * 8,
  },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Bound brute-force attempts before paying the bcrypt cost:
        // sliding window on (ip, email) — 8 tries per 15 min.
        const headers = (request as { headers?: Headers })?.headers;
        const ip =
          headers?.get?.("cf-connecting-ip") ??
          headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ??
          "?";
        const key = `login:${ip}:${email}`;
        const limit = consumeRateLimit(key, { limit: 8, windowMs: 15 * 60 * 1000 });
        if (!limit.allowed) {
          log.warn("auth: rate-limit hit at login", { module: "auth", ip });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, password: true, role: true, active: true, clientId: true },
        });
        if (!user || !user.active) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        resetRateLimit(key);
        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {/* best-effort */});
        prisma.auditLog
          .create({ data: { userId: user.id, actorEmail: user.email, action: "LOGIN", ip } })
          .catch(() => {/* best-effort */});

        return { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.clientId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.role = (user as { role?: Role }).role ?? "CSR";
        token.clientId = (user as { clientId?: string | null }).clientId ?? null;
        token.iat = Math.floor(Date.now() / 1000);
      }
      // Session-revocation + live role refresh — a deactivated user or
      // bumped sessionsRevokedAt invalidates the token immediately.
      if (token.userId && typeof token.iat === "number") {
        try {
          const u = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { sessionsRevokedAt: true, active: true, role: true, clientId: true },
          });
          if (!u || !u.active) return null;
          if (u.sessionsRevokedAt && Math.floor(u.sessionsRevokedAt.getTime() / 1000) > (token.iat as number)) {
            return null;
          }
          token.role = u.role;
          token.clientId = u.clientId;
        } catch {
          /* let the token through on a DB blip */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        const augmented = session as { userId?: string; role?: Role; clientId?: string | null };
        augmented.userId = token.userId as string | undefined;
        augmented.role = (token.role as Role | undefined) ?? "CSR";
        augmented.clientId = (token.clientId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

export { isSafeRedirect } from "@/lib/redirect";

/** Session shape with our custom claims. */
export type AppSession = {
  userId: string;
  role: Role;
  clientId?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

/**
 * Require a signed-in STAFF session (ADMIN/PRODUCER/CSR) in a server
 * component / action. Throws if absent — and throws for portal CLIENT
 * users too: every pre-portal call site is staff-only, and server
 * actions must stay terminally closed to clients even if the
 * middleware route guard were ever bypassed.
 */
export async function requireSession(): Promise<AppSession> {
  const session = (await auth()) as (AppSession & { user?: { name?: string | null; email?: string | null } }) | null;
  if (!session?.userId) throw new Error("Not authenticated");
  if (session.role === "CLIENT") throw new Error("Staff access required");
  return session;
}

/** Require ADMIN role. Throws on anything else. */
export async function requireAdmin(): Promise<AppSession> {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("Admin access required");
  return session;
}

/**
 * Route-handler guard for STAFF API endpoints (CSV exports, etc.). Returns
 * the session on success, or a `Response` (401/403) to return directly —
 * NEVER throws, so a route handler doesn't 500 on an unauthenticated hit.
 *
 * Defense in depth on top of the middleware route wall: these endpoints
 * surface the whole book (premiums, commissions, AR, lead ROI), so they
 * re-assert the auth wall at the handler — a CLIENT session or no session
 * is terminally closed even if the edge guard were ever bypassed.
 *
 *   const gate = await requireApiSession();
 *   if (gate instanceof Response) return gate;
 *   // gate is AppSession here
 */
export async function requireApiSession(): Promise<AppSession | Response> {
  const session = (await auth()) as AppSession | null;
  if (!session?.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (session.role === "CLIENT") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return session;
}

/**
 * Require a signed-in CLIENT (portal) session with a linked Client.
 * Throws on staff or unlinked sessions — portal server actions must
 * never run with a staff identity, and every portal query is scoped by
 * the returned clientId (NEVER by an id from params/body).
 */
export async function requireClientUser(): Promise<AppSession & { clientId: string }> {
  const session = (await auth()) as AppSession | null;
  if (!session?.userId) throw new Error("Not authenticated");
  if (session.role !== "CLIENT" || !session.clientId) throw new Error("Client portal access required");
  return session as AppSession & { clientId: string };
}
