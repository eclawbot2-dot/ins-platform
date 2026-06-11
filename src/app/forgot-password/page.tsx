import Link from "next/link";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/lib/password-reset";

export const metadata = { title: "Forgot password" };

async function requestReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const result = await requestPasswordReset(email);
  if (!result.ok) {
    // Intentional explicit "Email not found" — portfolio UX rule.
    redirect(`/forgot-password?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="card-pad">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Reset your password</h1>
          <p className="mb-4 text-sm text-slate-500">
            Enter your account email and we&apos;ll send a reset link.
          </p>
          {sent ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Reset link sent. Check your inbox (link valid for 1 hour).
            </div>
          ) : null}
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <form action={requestReset} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" name="email" required className="input" />
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-2">
              Send reset link
            </button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="text-navy-700 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
