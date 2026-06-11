import { Shield } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <aside className="flex h-full min-h-screen w-64 flex-col bg-[#0e203b] text-slate-300">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
        <Shield className="h-6 w-6 text-gold-400" />
        <div>
          <div className="text-sm font-bold tracking-wide text-white">{BRAND.name}</div>
          <div className="text-[11px] text-slate-400">{BRAND.staffTagline}</div>
        </div>
      </div>
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="truncate text-sm font-medium text-white">{userName}</div>
        <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{userRole}</div>
        <SignOutButton />
      </div>
    </aside>
  );
}
