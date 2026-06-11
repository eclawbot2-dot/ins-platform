import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { requirePortalSession } from "@/lib/portal";
import { FlashToast } from "@/components/ui/toast";
import { PortalNav } from "./portal-nav";
import { PortalSignOut } from "./portal-sign-out";

/**
 * Authed client-portal shell. The layout gate is convenience only —
 * the middleware role wall plus requirePortalSession() inside EVERY
 * page are the real protections (layout-only checks leak RSC flight
 * payloads).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy-800 text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-navy-700 ring-1 ring-gold-400/40">
              <ShieldCheck className="h-5 w-5 text-gold-400" />
            </span>
            <div>
              <div className="text-sm font-bold tracking-wide">{BRAND.name}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300">{BRAND.portalTagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[180px] truncate text-sm text-slate-300 sm:block">{session.name}</span>
            <PortalSignOut />
          </div>
        </div>
        <PortalNav />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {children}
        <Suspense fallback={null}>
          <FlashToast />
        </Suspense>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-slate-500 sm:px-6">
          {BRAND.name} · {BRAND.phone} · {BRAND.email}
        </div>
      </footer>
    </div>
  );
}
