import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { findInviteByToken } from "@/lib/portal-invite";
import { inviteState, inviteStateMessage } from "@/lib/domain/portal-invite";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";

function PortalShell({ children }: { children: React.ReactNode }) {
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
        <div className="card-pad">{children}</div>
      </div>
    </div>
  );
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const invite = await findInviteByToken(token);
  const state = invite ? inviteState(invite) : null;

  if (!invite || state !== "valid") {
    return (
      <PortalShell>
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Invitation unavailable</h1>
        <p className="text-sm text-slate-600">
          {invite ? inviteStateMessage(state!) : "This invitation link is invalid."}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/portal/login" className="text-navy-600 hover:underline">
            Go to portal sign-in
          </Link>
        </p>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Activate your account</h1>
      <p className="mb-4 text-sm text-slate-600">
        Secure portal access for <strong>{invite.client.name}</strong> ({invite.email}). Choose a
        password to finish setting up your account.
      </p>
      <form action={acceptInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="invite-name">Your name</label>
          <input id="invite-name" name="name" className="input" defaultValue={invite.client.name} required />
        </div>
        <div>
          <label className="label" htmlFor="invite-password">Password</label>
          <input
            id="invite-password"
            name="password"
            type="password"
            className="input"
            minLength={8}
            autoComplete="new-password"
            required
          />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="invite-confirm">Confirm password</label>
          <input
            id="invite-confirm"
            name="confirm"
            type="password"
            className="input"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="btn-primary w-full justify-center py-2.5">
          Activate account
        </button>
      </form>
    </PortalShell>
  );
}
