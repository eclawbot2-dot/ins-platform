import { Suspense } from "react";
import { ShieldCheck, Sparkles, FileSearch } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { ALL_LOBS, LOB_LABELS, lobSegment } from "@/lib/labels";
import { CompareForm } from "./compare-form";

export const metadata = {
  title: "Free Coverage Checkup",
  description: "Upload your current policy and get an instant, plain-English coverage analysis — what's covered, what's missing, and what to fix.",
};

export default function ComparePage() {
  const personal = ALL_LOBS.filter((l) => lobSegment(l) === "Personal");
  const commercial = ALL_LOBS.filter((l) => lobSegment(l) === "Commercial");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-navy-800 text-white">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-4 sm:px-6">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-navy-700 ring-1 ring-gold-400/40">
            <ShieldCheck className="h-5 w-5 text-gold-400" />
          </span>
          <div>
            <div className="text-sm font-bold tracking-wide">{BRAND.name}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-300">Free Coverage Checkup</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Sparkles className="h-6 w-6 text-gold-500" /> Is your coverage actually protecting you?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Upload your current declarations page (or just paste the details) and we&apos;ll tell you what&apos;s in it,
            summarize your coverages in plain English, and flag what&apos;s <strong>missing or underinsured</strong> —
            free, no obligation.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: FileSearch, title: "We read your policy", body: "Upload a PDF or photo of your dec page." },
            { icon: Sparkles, title: "Plain-English summary", body: "What you have, in words you understand." },
            { icon: ShieldCheck, title: "Gaps & fixes", body: "Where you're exposed and how to close it." },
          ].map((s) => (
            <div key={s.title} className="card-pad">
              <s.icon className="mb-1.5 h-5 w-5 text-navy-600" />
              <div className="text-sm font-semibold text-slate-900">{s.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="card-pad">
          <Suspense fallback={null}>
            <CompareForm
              personalLobs={personal.map((l) => ({ value: l, label: LOB_LABELS[l] }))}
              commercialLobs={commercial.map((l) => ({ value: l, label: LOB_LABELS[l] }))}
            />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {BRAND.name} · {BRAND.phone} · Your information is used only to prepare your coverage report.
        </p>
      </main>
    </div>
  );
}
