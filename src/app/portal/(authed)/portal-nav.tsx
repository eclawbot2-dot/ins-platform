"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/portal", label: "Dashboard", exact: true },
  { href: "/portal/policies", label: "Policies" },
  { href: "/portal/checkup", label: "Coverage Checkup" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/claims", label: "Claims" },
  { href: "/portal/certificates", label: "Certificates" },
  { href: "/portal/preferences", label: "Preferences" },
  { href: "/portal/profile", label: "Profile" },
];

/** Horizontal portal nav — scrolls on small screens, mobile-first. */
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal navigation" className="border-t border-white/10">
      <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-2 sm:px-4">
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "border-gold-400 text-white"
                  : "border-transparent text-slate-300 hover:border-white/30 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
