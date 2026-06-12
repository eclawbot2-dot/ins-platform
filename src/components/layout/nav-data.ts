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
  CalendarClock,
  ShieldAlert,
  Wallet,
  FileCheck2,
  FileBadge,
  FolderOpen,
  ShieldCheck,
  UsersRound,
  Megaphone,
  Receipt,
  BarChart3,
  Settings,
  HeartHandshake,
  Sparkles,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
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
      { href: "/tools/coverage-analysis", label: "Coverage analysis", icon: Sparkles },
      { href: "/renewals", label: "Renewals", icon: RefreshCw },
      { href: "/renewals/xdates", label: "X-dates", icon: CalendarClock },
      { href: "/claims", label: "Claims", icon: ShieldAlert },
      { href: "/certificates", label: "Certificates", icon: FileCheck2 },
      { href: "/eoi", label: "Evidence of Property", icon: FileBadge },
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
      { href: "/touchpoints", label: "Touchpoints", icon: HeartHandshake },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];
