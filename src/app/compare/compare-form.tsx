"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

type Opt = { value: string; label: string };

export function CompareForm({
  personalLobs,
  commercialLobs,
}: {
  personalLobs: Opt[];
  commercialLobs: Opt[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/public/compare", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { analysisId?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      if (json.analysisId) {
        router.push(`/compare/${json.analysisId}`);
        return;
      }
      setError("Thanks — your submission was received.");
      setBusy(false);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cmp-name">Your name *</label>
          <input id="cmp-name" name="name" required maxLength={200} className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="cmp-email">Email</label>
          <input id="cmp-email" name="email" type="email" maxLength={254} className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="cmp-phone">Phone</label>
          <input id="cmp-phone" name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="cmp-zip">ZIP</label>
          <input id="cmp-zip" name="zip" maxLength={10} className="input" autoComplete="postal-code" />
        </div>
        <div>
          <label className="label" htmlFor="cmp-lob">Type of insurance</label>
          <select id="cmp-lob" name="lineOfBusiness" className="input" defaultValue="">
            <option value="">— Select (optional) —</option>
            <optgroup label="Personal">
              {personalLobs.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
            <optgroup label="Commercial">
              {commercialLobs.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="cmp-file">Upload your policy (PDF or photo)</label>
        <label
          htmlFor="cmp-file"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-navy-400 hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" />
          {fileName ?? "Choose a PDF or image (max 25 MB)"}
        </label>
        <input
          id="cmp-file"
          name="file"
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </div>

      <div>
        <label className="label" htmlFor="cmp-details">…or paste your coverage details</label>
        <textarea
          id="cmp-details"
          name="details"
          rows={4}
          maxLength={20000}
          className="input"
          placeholder="e.g. Auto policy, 100/300 BI, $500 comp/collision deductible, no umbrella…"
        />
      </div>

      {/* Honeypot — hidden from humans, bots fill it. */}
      <div aria-hidden className="hidden">
        <label htmlFor="cmp-website">Website</label>
        <input id="cmp-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2.5">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing your policy…
          </>
        ) : (
          "Get my free coverage report"
        )}
      </button>
    </form>
  );
}
