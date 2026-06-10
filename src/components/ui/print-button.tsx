"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn no-print">
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
