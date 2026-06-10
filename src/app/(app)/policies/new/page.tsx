import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { PolicyForm } from "../policy-form";
import { createPolicy } from "../actions";

export const metadata = { title: "New policy" };
export const dynamic = "force-dynamic";

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const [clients, carriers, users] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.carrier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New policy" description="Enter a quote or in-force policy." />
      <PolicyForm clients={clients} carriers={carriers} users={users} defaults={{ clientId }} action={createPolicy} submitLabel="Create policy" />
    </>
  );
}
