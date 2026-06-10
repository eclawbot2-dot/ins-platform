import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { LeadForm } from "../lead-form";
import { createLead } from "../actions";

export const metadata = { title: "New lead" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const [users, campaigns] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New lead" />
      <LeadForm users={users} campaigns={campaigns} action={createLead} submitLabel="Create lead" />
    </>
  );
}
