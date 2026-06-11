import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ClientForm } from "../../client-form";
import { updateClient } from "../../actions";

export const metadata = { title: "Edit client" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, users] = await Promise.all([
    prisma.client.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { active: true, role: { not: "CLIENT" } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  if (!client) notFound();
  return (
    <>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm client={client} users={users} action={updateClient.bind(null, client.id)} submitLabel="Save changes" />
    </>
  );
}
