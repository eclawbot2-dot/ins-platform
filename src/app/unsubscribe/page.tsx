import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { audit } from "@/lib/audit";

/**
 * One-click, token-authenticated unsubscribe (CAN-SPAM). NO login required.
 * GET /unsubscribe?token=… resolves the token to a client's comm-prefs row
 * and turns OFF appreciation (and, with &category=all, everything). The act
 * happens on page load so a single click from an email footer is enough.
 *
 * The token is the per-client unsubscribeToken (a cuid); an unknown token
 * renders a neutral page rather than confirming an opt-out for a guessed
 * value. The optional `category` narrows the opt-out to one journey family.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences" };

const CATEGORY_FIELD: Record<string, keyof PrefsUpdate> = {
  onboarding: "optOnboarding",
  renewal: "optRenewal",
  payment: "optPayment",
  claim: "optClaim",
  appreciation: "optAppreciation",
  satisfaction: "optSatisfaction",
  offboarding: "optOffboarding",
};

type PrefsUpdate = {
  optOnboarding?: boolean;
  optRenewal?: boolean;
  optPayment?: boolean;
  optClaim?: boolean;
  optAppreciation?: boolean;
  optSatisfaction?: boolean;
  optOffboarding?: boolean;
  doNotContact?: boolean;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-navy-800 px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-700 ring-1 ring-gold-400/40">
            <HeartHandshake className="h-8 w-8 text-gold-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">{BRAND.name}</div>
        </div>
        <div className="card-pad text-center">{children}</div>
      </div>
    </div>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; category?: string }>;
}) {
  const { token, category } = await searchParams;

  if (!token) {
    return (
      <Shell>
        <h1 className="section-title mb-2">Link incomplete</h1>
        <p className="text-sm text-slate-600">This unsubscribe link is missing its token. Please use the link from a recent email, or contact us at {BRAND.phone}.</p>
      </Shell>
    );
  }

  const prefs = await prisma.clientCommunicationPreferences.findUnique({
    where: { unsubscribeToken: token },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!prefs) {
    // Neutral page for an unknown/expired token — no enumeration of valid prefs.
    return (
      <Shell>
        <h1 className="section-title mb-2">You&apos;re all set</h1>
        <p className="text-sm text-slate-600">
          If this link came from one of our emails, your preferences are already updated. To manage
          everything, sign in to your portal.
        </p>
      </Shell>
    );
  }

  const all = (category ?? "").toLowerCase() === "all";
  const field = category ? CATEGORY_FIELD[category.toLowerCase()] : undefined;

  const update: PrefsUpdate = all
    ? { doNotContact: true }
    : field
      ? { [field]: false }
      : { optAppreciation: false };

  await prisma.clientCommunicationPreferences.update({ where: { unsubscribeToken: token }, data: update });
  await audit({
    action: "TOUCHPOINT_UNSUBSCRIBE",
    entityType: "Client",
    entityId: prefs.client.id,
    detail: all ? "do-not-contact" : (field ?? "appreciation"),
  });

  return (
    <Shell>
      <h1 className="section-title mb-2">You&apos;ve been unsubscribed</h1>
      <p className="text-sm text-slate-600">
        {all
          ? `We've stopped all marketing and appreciation emails to ${prefs.client.name}.`
          : `We've turned off ${field ? prettyCategory(category!) : "appreciation"} emails. You'll still get important policy and payment notices.`}
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Changed your mind, or want finer control? You can manage every preference from your portal.
      </p>
      <Link href="/portal/preferences" className="btn-primary mt-4 inline-flex">Manage all preferences</Link>
    </Shell>
  );
}

function prettyCategory(category: string): string {
  const c = category.toLowerCase();
  return c.charAt(0).toUpperCase() + c.slice(1);
}
