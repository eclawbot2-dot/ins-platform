import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { FileTerminal, KeyRound, Mail, Plug, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Field, FormGrid } from "@/components/ui/form";
import { updateAgencyProfile } from "./actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/team", icon: Users, title: "Users & roles", description: "Add users, set roles, passwords, default splits (admin)." },
  { href: "/settings/integrations", icon: Plug, title: "Integrations", description: "Xero, Google Workspace, and Resend status." },
  { href: "/settings/templates", icon: Mail, title: "Email templates", description: "Reusable subjects/bodies for outbound email." },
  { href: "/settings/keys", icon: KeyRound, title: "Lead intake keys", description: "API keys the marketing site uses to post leads." },
  { href: "/settings/audit", icon: FileTerminal, title: "Audit log", description: "Logins and critical changes, newest first." },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const profile = await prisma.agencyProfile.findUnique({ where: { id: "agency" } });

  return (
    <>
      <PageHeader title="Settings" description="Agency profile, users, integrations, templates, and audit." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card-pad transition hover:shadow-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <s.icon className="h-4 w-4 text-navy-500" /> {s.title}
            </div>
            <p className="mt-1 text-xs text-slate-500">{s.description}</p>
          </Link>
        ))}
      </div>

      <div className="card-pad max-w-3xl">
        <h2 className="section-title mb-3">Agency profile</h2>
        {isAdmin ? (
          <form action={updateAgencyProfile} className="space-y-4">
            <FormGrid>
              <Field label="Agency name" required>
                <input name="name" defaultValue={profile?.name ?? BRAND.name} required className="input" />
              </Field>
              <Field label="Agency license #">
                <input name="licenseNumber" defaultValue={profile?.licenseNumber ?? ""} className="input" />
              </Field>
              <Field label="Address line 1">
                <input name="addressLine1" defaultValue={profile?.addressLine1 ?? ""} className="input" />
              </Field>
              <Field label="Address line 2">
                <input name="addressLine2" defaultValue={profile?.addressLine2 ?? ""} className="input" />
              </Field>
            </FormGrid>
            <FormGrid cols={3}>
              <Field label="City">
                <input name="city" defaultValue={profile?.city ?? ""} className="input" />
              </Field>
              <Field label="State">
                <input name="state" maxLength={2} defaultValue={profile?.state ?? ""} className="input" />
              </Field>
              <Field label="ZIP">
                <input name="zip" defaultValue={profile?.zip ?? ""} className="input" />
              </Field>
              <Field label="Phone">
                <input name="phone" defaultValue={profile?.phone ?? ""} className="input" />
              </Field>
              <Field label="Email">
                <input name="email" type="email" defaultValue={profile?.email ?? ""} className="input" />
              </Field>
              <Field label="Website">
                <input name="website" defaultValue={profile?.website ?? ""} className="input" />
              </Field>
            </FormGrid>
            <button type="submit" className="btn-primary">Save profile</button>
          </form>
        ) : (
          <div className="text-sm text-slate-600">
            <div className="font-medium text-slate-900">{profile?.name ?? BRAND.name}</div>
            <div>{profile?.addressLine1}</div>
            <div>{[profile?.city, profile?.state, profile?.zip].filter(Boolean).join(", ")}</div>
            <div>{profile?.phone} · {profile?.email}</div>
            <p className="mt-2 text-xs text-slate-400">Editing the agency profile requires the ADMIN role.</p>
          </div>
        )}
      </div>
    </>
  );
}
