import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  href?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const body = (
    <div className="card-pad flex items-start justify-between gap-3 transition hover:shadow-md">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div
          className={clsx("mt-1 text-2xl font-semibold", {
            "text-slate-900": tone === "default",
            "text-amber-600": tone === "warn",
            "text-red-600": tone === "danger",
            "text-emerald-600": tone === "good",
          })}
        >
          {value}
        </div>
        {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
      </div>
      {Icon ? <Icon className="h-5 w-5 shrink-0 text-indigo-400" /> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
