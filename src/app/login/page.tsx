"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { isSafeRedirect } from "@/lib/redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    // it carries the internal localhost origin. Use the relative
    // callbackUrl param (validated) or /dashboard.
    const cb = searchParams.get("callbackUrl") ?? "";
    router.push(isSafeRedirect(cb) ? cb : "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-navy-700 hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shield className="h-7 w-7 text-navy-600" />
          <div>
            <div className="text-lg font-bold text-slate-900">{BRAND.name}</div>
            <div className="text-xs text-slate-500">Staff sign-in · {BRAND.staffTagline}</div>
          </div>
        </div>
        <div className="card-pad">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
