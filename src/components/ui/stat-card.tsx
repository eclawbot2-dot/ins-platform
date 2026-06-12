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
  const text = String(value);
  const body = (
    <div className="card-pad flex min-w-0 items-start justify-between gap-3 overflow-hidden transition hover:shadow-md">
      <div className="min-w-0 flex-1">
        <div className="break-words text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div
          title={text}
          className={clsx("mt-1 truncate text-xl font-semibold tabular-nums md:text-2xl", {
            "text-slate-900": tone === "default",
            "text-amber-600": tone === "warn",
            "text-red-600": tone === "danger",
            "text-emerald-600": tone === "good",
          })}
        >
          {value}
        </div>
        {sub ? <div className="mt-0.5 break-words text-xs text-slate-500">{sub}</div> : null}
      </div>
      {Icon ? <Icon className="h-5 w-5 shrink-0 text-gold-400" /> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0">
      {body}
    </Link>
  ) : (
    body
  );
}
