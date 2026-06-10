import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ClientForm } from "../client-form";
import { createClient } from "../actions";

export const metadata = { title: "New client" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader title="New client" description="Add an individual or business client." />
      <ClientForm users={users} action={createClient} submitLabel="Create client" />
    </>
  );
}
