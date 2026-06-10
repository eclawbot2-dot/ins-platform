"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/**
 * Flash toast — server actions redirect with ?toast=Message (or
 * ?toastError=Message); this client component renders it and strips
 * the param from the URL. Auto-dismisses after 5s.
 */
export function FlashToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = searchParams.get("toast");
  const toastError = searchParams.get("toastError");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!toast && !toastError) return;
    const t = setTimeout(() => {
      setVisible(false);
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("toast");
      sp.delete("toastError");
      router.replace(sp.size ? `${pathname}?${sp}` : pathname, { scroll: false });
    }, 5000);
    return () => clearTimeout(t);
  }, [toast, toastError, pathname, router, searchParams]);

  const message = toastError ?? toast;
  if (!message || !visible) return null;
  const isError = Boolean(toastError);

  return (
    <div className="no-print fixed bottom-4 right-4 z-50">
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${
          isError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
        role="status"
      >
        {isError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        <span>{message}</span>
        <button onClick={() => setVisible(false)} aria-label="Dismiss" className="ml-2 cursor-pointer">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
