import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { FlashToast } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.userId) redirect("/login");
  // Role wall, defense-in-depth on the middleware: a CLIENT session must never
  // render the staff shell (which would leak its RSC payload), so bounce it to
  // the portal with a returning redirect BEFORE any staff page renders.
  if (session.role === "CLIENT") redirect("/portal");

  const userName = session.user?.name ?? "User";
  const userRole = String(session.role ?? "CSR");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MobileNav userName={userName} userRole={userRole} />
      <div className="no-print sticky top-0 hidden h-screen lg:block">
        <Sidebar userName={userName} userRole={userRole} />
      </div>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-5 sm:py-6 lg:px-8">
        {children}
        <Suspense fallback={null}>
          <FlashToast />
        </Suspense>
      </main>
    </div>
  );
}
