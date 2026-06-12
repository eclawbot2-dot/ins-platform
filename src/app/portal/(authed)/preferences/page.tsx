import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { portalUpdateCommPrefs } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences" };

const CATEGORIES: Array<{ name: string; label: string; blurb: string }> = [
  { name: "optOnboarding", label: "Welcome & getting started", blurb: "Onboarding help when you first join." },
  { name: "optRenewal", label: "Renewal reminders", blurb: "Heads-up before your policies renew." },
  { name: "optPayment", label: "Payment reminders", blurb: "Friendly nudges before a bill is due." },
  { name: "optClaim", label: "Claim updates", blurb: "Status on any claim you've filed." },
  { name: "optAppreciation", label: "Appreciation & greetings", blurb: "Birthday, holiday, and thank-you notes." },
  { name: "optSatisfaction", label: "Check-ins & surveys", blurb: "Occasional 'how are we doing?' notes." },
  { name: "optOffboarding", label: "Goodbye & win-back", blurb: "Notes if you ever leave us." },
];

export default async function PortalPreferencesPage() {
  const session = await requirePortalSession();
  const prefs = await prisma.clientCommunicationPreferences.findUnique({ where: { clientId: session.clientId } });

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Email preferences</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Choose which kinds of emails you&apos;d like from us. We&apos;ll always honor these — important
          policy and payment notices may still reach you when required by law.
        </p>
      </div>

      <div className="card-pad max-w-2xl">
        <form action={portalUpdateCommPrefs} className="space-y-4">
          <label className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">
            <input type="checkbox" name="doNotContact" defaultChecked={prefs?.doNotContact ?? false} />
            Stop all marketing &amp; appreciation emails (do not contact)
          </label>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            {CATEGORIES.map((c) => (
              <label key={c.name} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name={c.name}
                  defaultChecked={(prefs?.[c.name as keyof typeof prefs] as boolean | undefined) ?? true}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-slate-800">{c.label}</span>
                  <span className="block text-xs text-slate-500">{c.blurb}</span>
                </span>
              </label>
            ))}
          </div>

          <button type="submit" className="btn-primary w-full justify-center py-2.5 sm:w-auto">
            Save preferences
          </button>
        </form>
      </div>
    </>
  );
}
