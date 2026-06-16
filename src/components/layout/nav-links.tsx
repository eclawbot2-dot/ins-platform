"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { NAV_SECTIONS } from "./nav-data";
import {
  ROOT_KEY,
  applyOrder,
  isHidden,
  itemIdOf,
  useNavCustomization,
} from "./nav-customization";
import { NavContextMenu } from "./nav-context-menu";

/**
 * Shared nav list for the desktop sidebar and the mobile drawer.
 * Highlights the active section (exact match or path prefix) and uses
 * larger touch targets when `size="lg"` (mobile drawer, ≥44px rows).
 *
 * Per-user customization (reorder + hide of groups/items) is applied from
 * localStorage; right-clicking a group header or item row opens a menu to
 * move it or hide it. Until the post-mount effect runs we render the default
 * order so the markup matches the server render (no hydration mismatch).
 */
export function NavLinks({ size = "md", onNavigate }: { size?: "md" | "lg"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const { custom, mounted, apply } = useNavCustomization();

  // Before mount, use the empty default so SSR and first CSR paint match.
  const groups = mounted
    ? applyOrder(NAV_SECTIONS, (s) => s.title, custom.order[ROOT_KEY]).filter(
        (s) => !isHidden(custom, s.title),
      )
    : NAV_SECTIONS;
  const groupOrder = groups.map((s) => s.title);

  return (
    <>
      {groups.map((section) => {
        const items = mounted
          ? applyOrder(section.items, (it) => itemIdOf(section.title, it.href), custom.order[section.title]).filter(
              (it) => !isHidden(custom, itemIdOf(section.title, it.href)),
            )
          : section.items;
        const itemOrder = items.map((it) => itemIdOf(section.title, it.href));
        return (
          <NavContextMenu
            key={section.title}
            kind="group"
            id={section.title}
            parentKey={ROOT_KEY}
            siblings={groupOrder}
            label={section.title}
            apply={apply}
          >
            <div className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <NavContextMenu
                      key={item.href}
                      as="li"
                      kind="item"
                      id={itemIdOf(section.title, item.href)}
                      parentKey={section.title}
                      siblings={itemOrder}
                      label={item.label}
                      apply={apply}
                    >
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "flex items-center rounded-lg px-2 font-medium transition",
                          size === "lg" ? "gap-3 py-3 text-sm" : "gap-2.5 py-1.5 text-[13px]",
                          active
                            ? "bg-navy-500/20 text-white"
                            : "text-slate-300 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <item.icon className={clsx("h-4 w-4", active ? "text-navy-300" : "text-slate-400")} />
                        {item.label}
                      </Link>
                    </NavContextMenu>
                  );
                })}
              </ul>
            </div>
          </NavContextMenu>
        );
      })}
    </>
  );
}
