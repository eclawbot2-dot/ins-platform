import Link from "next/link";
import { BarChart3, BookOpen, Filter, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Reports" };

const REPORTS = [
  {
    href: "/reports/book",
    icon: BookOpen,
    title: "Book of business",
    description: "Active premium and commission by carrier, line of business, or producer.",
  },
  {
    href: "/reports/production",
    icon: Users,
    title: "Producer production",
    description: "Written premium, policy count, and commission per producer over a period.",
  },
  {
    href: "/reports/retention",
    icon: RefreshCw,
    title: "Retention",
    description: "Renewed vs lost terms over the trailing 12 months — the headline retention rate.",
  },
  {
    href: "/reports/trend",
    icon: TrendingUp,
    title: "New vs renewal premium trend",
    description: "Monthly written premium split new business vs renewal, trailing 12 months.",
  },
  {
    href: "/reports/commissions",
    icon: Wallet,
    title: "Commission revenue",
    description: "Carrier-statement commission received per month — actual agency revenue.",
  },
  {
    href: "/reports/funnel",
    icon: Filter,
    title: "Pipeline conversion funnel",
    description: "Opportunities reaching each stage, plus the close rate on decided deals.",
  },
  {
    href: "/commissions/payables",
    icon: BarChart3,
    title: "Producer payables",
    description: "Reconciled statement commission allocated by policy split rules.",
  },
];

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Agency analytics — every report exports CSV." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="card-pad transition hover:shadow-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <r.icon className="h-4 w-4 text-navy-500" /> {r.title}
            </div>
            <p className="mt-1 text-xs text-slate-500">{r.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
