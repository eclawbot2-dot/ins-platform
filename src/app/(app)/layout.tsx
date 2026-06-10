import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { FlashToast } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.userId) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <div className="no-print sticky top-0 hidden h-screen lg:block">
        <Sidebar userName={session.user?.name ?? "User"} userRole={String(session.role ?? "CSR")} />
      </div>
      <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">
        {children}
        <Suspense fallback={null}>
          <FlashToast />
        </Suspense>
      </main>
    </div>
  );
}
