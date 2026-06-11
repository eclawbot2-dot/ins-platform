import Link from "next/link";
import { redirect } from "next/navigation";
import { completePasswordReset } from "@/lib/password-reset";

export const metadata = { title: "Set new password" };

async function completeReset(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Passwords do not match.")}`);
  }
  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.error)}`);
  }
  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="card-pad">
          <h1 className="mb-4 text-lg font-semibold text-slate-900">Set a new password</h1>
          {!token ? (
            <p className="text-sm text-red-600">
              Missing reset token. Use the link from your email, or{" "}
              <Link href="/forgot-password" className="text-navy-700 underline">
                request a new one
              </Link>
              .
            </p>
          ) : (
            <>
              {error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              <form action={completeReset} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <div>
                  <label className="label">New password</label>
                  <input type="password" name="password" minLength={8} required className="input" />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input type="password" name="confirm" minLength={8} required className="input" />
                </div>
                <button type="submit" className="btn-primary w-full justify-center py-2">
                  Set password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
