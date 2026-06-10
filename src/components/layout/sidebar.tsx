import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  GitBranch,
  ListChecks,
  FileText,
  Building2,
  Calculator,
  RefreshCw,
  ShieldAlert,
  Wallet,
  FileCheck2,
  FolderOpen,
  ShieldCheck,
  UsersRound,
  Megaphone,
  Receipt,
  BarChart3,
  Settings,
  Shield,
} from "lucide-react";
import { SignOutButton } from "./sign-out-button";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/leads", label: "Leads", icon: UserPlus },
      { href: "/opportunities", label: "Pipeline", icon: GitBranch },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/policies", label: "Policies", icon: FileText },
      { href: "/quotes", label: "Quoting", icon: Calculator },
      { href: "/renewals", label: "Renewals", icon: RefreshCw },
      { href: "/claims", label: "Claims", icon: ShieldAlert },
      { href: "/certificates", label: "Certificates", icon: FileCheck2 },
      { href: "/carriers", label: "Carriers", icon: Building2 },
      { href: "/documents", label: "Documents", icon: FolderOpen },
    ],
  },
  {
    title: "Back office",
    items: [
      { href: "/commissions", label: "Commissions", icon: Wallet },
      { href: "/accounting", label: "Accounting", icon: Receipt },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/team", label: "Team", icon: UsersRound },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <aside className="flex h-full min-h-screen w-64 flex-col bg-[#101a33] text-slate-300">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
        <Shield className="h-6 w-6 text-indigo-400" />
        <div>
          <div className="text-sm font-bold tracking-wide text-white">Ins Platform</div>
          <div className="text-[11px] text-slate-400">Agency Management</div>
        </div>
      </div>
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <item.icon className="h-4 w-4 text-slate-400" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="truncate text-sm font-medium text-white">{userName}</div>
        <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{userRole}</div>
        <SignOutButton />
      </div>
    </aside>
  );
}
