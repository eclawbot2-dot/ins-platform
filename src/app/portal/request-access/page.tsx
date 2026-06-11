import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { requestAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

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
          {sent ? (
            <>
              <h1 className="mb-2 text-lg font-semibold text-slate-900">Request received</h1>
              <p className="text-sm text-slate-600">
                Thanks — our team will review your request and email you a portal invitation,
                usually within one business day.
              </p>
              <p className="mt-4 text-sm">
                <Link href="/portal/login" className="text-navy-600 hover:underline">
                  Back to sign-in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-semibold text-slate-900">Request portal access</h1>
              <p className="mb-4 text-sm text-slate-600">
                Already a {BRAND.name} client? Tell us who you are and we&apos;ll send you a secure
                invitation.
              </p>
              <form action={requestAccessAction} className="space-y-4">
                <div>
                  <label className="label" htmlFor="ra-name">Your name</label>
                  <input id="ra-name" name="name" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="ra-email">Email</label>
                  <input id="ra-email" name="email" type="email" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="ra-message">Message (optional)</label>
                  <textarea
                    id="ra-message"
                    name="message"
                    rows={3}
                    className="input"
                    placeholder="Business name, policy number, or anything that helps us find your account"
                  />
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <button type="submit" className="btn-primary w-full justify-center py-2.5">
                  Send request
                </button>
                <p className="text-center text-sm">
                  <Link href="/portal/login" className="text-navy-600 hover:underline">
                    Back to sign-in
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
