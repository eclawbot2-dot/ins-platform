import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { loadPolicyExisting } from "@/lib/domain/policy-detail";
import { PolicyForm } from "../../policy-form";
import { updatePolicy } from "../../actions";

export const metadata = { title: "Edit policy" };
export const dynamic = "force-dynamic";

export default async function EditPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [policy, clients, carriers, users] = await Promise.all([
    prisma.policy.findUnique({ where: { id } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.carrier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  if (!policy) notFound();
  const existing = await loadPolicyExisting(policy.id);
  return (
    <>
      <PageHeader title={`Edit ${policy.policyNumber}`} />
      <PolicyForm policy={policy} clients={clients} carriers={carriers} users={users} existing={existing} action={updatePolicy.bind(null, policy.id)} submitLabel="Save changes" />
    </>
  );
}
