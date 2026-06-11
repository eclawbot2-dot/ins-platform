"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Shield, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

/**
 * Mobile top bar + slide-in navigation drawer, shown below the `lg`
 * breakpoint (the desktop sidebar is hidden there). Closes on Escape,
 * backdrop click, and route change; locks body scroll while open.
 */
export function MobileNav({ userName, userRole }: { userName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close when the route changes (link tapped inside the drawer).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; lock body scroll while open; focus the close button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-navy-600" />
          <span className="text-sm font-bold text-slate-900">{BRAND.name}</span>
        </div>
        {/* Spacer to keep the brand centered */}
        <div className="h-11 w-11" aria-hidden="true" />
      </header>

      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-[#0e203b] text-slate-300 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Shield className="h-6 w-6 text-gold-400" />
                <div>
                  <div className="text-sm font-bold tracking-wide text-white">{BRAND.name}</div>
                  <div className="text-[11px] text-slate-400">{BRAND.staffTagline}</div>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
              <NavLinks size="lg" onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-white/10 px-4 py-3">
              <div className="truncate text-sm font-medium text-white">{userName}</div>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{userRole}</div>
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
