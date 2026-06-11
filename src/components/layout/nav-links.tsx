"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { NAV_SECTIONS } from "./nav-data";

/**
 * Shared nav list for the desktop sidebar and the mobile drawer.
 * Highlights the active section (exact match or path prefix) and uses
 * larger touch targets when `size="lg"` (mobile drawer, ≥44px rows).
 */
export function NavLinks({ size = "md", onNavigate }: { size?: "md" | "lg"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="mb-4">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {section.title}
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center rounded-lg px-2 font-medium transition",
                      size === "lg" ? "gap-3 py-3 text-sm" : "gap-2.5 py-1.5 text-[13px]",
                      active
                        ? "bg-indigo-500/20 text-white"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <item.icon className={clsx("h-4 w-4", active ? "text-indigo-300" : "text-slate-400")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
