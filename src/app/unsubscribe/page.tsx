import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { audit } from "@/lib/audit";

/**
 * Token-authenticated unsubscribe (CAN-SPAM). NO login required.
 *
 * Per-category opt-out (or the default appreciation opt-out) is ONE-CLICK on
 * GET /unsubscribe?token=…[&category=payment]: a single tap from an email
 * footer turns that journey off, as CAN-SPAM's one-click intent expects.
 *
 * The GLOBAL do-not-contact variant (&category=all) is DESTRUCTIVE — it stops
 * every email including policy/payment notices — so it is NOT performed on a
 * bare GET. Mail clients and security scanners aggressively PREFETCH links,
 * which would silently flip a client to do-not-contact without intent. The
 * `all` variant therefore renders a confirmation that POSTs a server action;
 * only the explicit submit performs the opt-out.
 *
 * The token is the per-client unsubscribeToken (a cuid); an unknown token
 * renders a neutral page rather than confirming an opt-out for a guessed value.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences" };

// Category one-click opt-out can ONLY toggle an opt* journey flag — never
// doNotContact (that destructive global stop is POST-confirmed below).
const CATEGORY_FIELD: Record<string, Exclude<keyof PrefsUpdate, "doNotContact">> = {
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

/** Confirmed global do-not-contact (POST only — never on a prefetchable GET). */
async function confirmDoNotContact(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (!token) return;
  const prefs = await prisma.clientCommunicationPreferences.findUnique({
    where: { unsubscribeToken: token },
    include: { client: { select: { id: true } } },
  });
  if (!prefs) return;
  await prisma.clientCommunicationPreferences.update({
    where: { unsubscribeToken: token },
    data: { doNotContact: true },
  });
  await audit({
    action: "TOUCHPOINT_UNSUBSCRIBE",
    entityType: "Client",
    entityId: prefs.client.id,
    detail: "do-not-contact (confirmed)",
  });
}

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

  // GLOBAL do-not-contact: confirm-before-act. Render a form that POSTs the
  // server action — a prefetch/scan of this GET must not opt the client out.
  if (all) {
    if (prefs.doNotContact) {
      return (
        <Shell>
          <h1 className="section-title mb-2">You&apos;re unsubscribed</h1>
          <p className="text-sm text-slate-600">
            We&apos;ve already stopped all emails to {prefs.client.name}.
          </p>
          <Link href="/portal/preferences" className="btn-primary mt-4 inline-flex">Manage all preferences</Link>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="section-title mb-2">Stop all emails?</h1>
        <p className="text-sm text-slate-600">
          This stops <strong>every</strong> email to {prefs.client.name} — including important policy,
          renewal, and payment notices. To turn off just marketing/appreciation email instead, use the
          link in that email&apos;s footer.
        </p>
        <form action={confirmDoNotContact} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn-primary inline-flex">Yes, stop all emails</button>
        </form>
        <Link href="/portal/preferences" className="mt-3 inline-flex text-sm text-slate-600 underline">
          No — manage individual preferences instead
        </Link>
      </Shell>
    );
  }

  // Per-category (or default appreciation) opt-out — safe to do one-click on GET.
  const field = category ? CATEGORY_FIELD[category.toLowerCase()] : undefined;
  const update: PrefsUpdate = field ? { [field]: false } : { optAppreciation: false };

  await prisma.clientCommunicationPreferences.update({ where: { unsubscribeToken: token }, data: update });
  await audit({
    action: "TOUCHPOINT_UNSUBSCRIBE",
    entityType: "Client",
    entityId: prefs.client.id,
    detail: field ? (category ?? "appreciation") : "appreciation",
  });

  return (
    <Shell>
      <h1 className="section-title mb-2">You&apos;ve been unsubscribed</h1>
      <p className="text-sm text-slate-600">
        We&apos;ve turned off {field ? prettyCategory(category!) : "appreciation"} emails. You&apos;ll still get important policy and payment notices.
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
