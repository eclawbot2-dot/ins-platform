"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function PortalSignOut() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/portal/login" })}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
