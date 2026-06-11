"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { isSafeRedirect } from "@/lib/redirect";

function PortalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlinked = searchParams.get("error") === "unlinked";
  const activated = searchParams.get("activated") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    // CRITICAL: never navigate to res.url — behind the Cloudflare tunnel
    // it carries the internal localhost origin. Relative paths only.
    const cb = searchParams.get("callbackUrl") ?? "";
    router.push(isSafeRedirect(cb) && cb.startsWith("/portal") ? cb : "/portal");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {activated ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Your account is ready — sign in below.
        </p>
      ) : null}
      {unlinked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your portal account isn&apos;t linked to a client record yet. Please contact the agency.
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="portal-email">Email</label>
        <input
          id="portal-email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="portal-password">Password</label>
        <input
          id="portal-password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2.5">
        {busy ? "Signing in…" : "Sign in to your account"}
      </button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-navy-600 hover:underline">
          Forgot password?
        </Link>
        <Link href="/portal/request-access" className="text-navy-600 hover:underline">
          Request access
        </Link>
      </div>
    </form>
  );
}

export default function PortalLoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-navy-800 px-4 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-700 ring-1 ring-gold-400/40">
            <ShieldCheck className="h-8 w-8 text-gold-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">{BRAND.name}</div>
          <div className="mt-1 text-sm font-medium uppercase tracking-[0.2em] text-gold-300">
            {BRAND.portalTagline}
          </div>
        </div>
        <div className="card-pad">
          <Suspense fallback={null}>
            <PortalLoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Manage your policies, documents, invoices and claims — securely, any time.
        </p>
      </div>
    </div>
  );
}
