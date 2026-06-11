"use server";

import { redirect } from "next/navigation";
import { acceptPortalInvite } from "@/lib/portal-invite";
import { fStr } from "@/lib/form";

/**
 * Public action — completes a portal invitation. All validation
 * (token state, expiry, single-use, email collisions) happens in
 * acceptPortalInvite. Redirects are RELATIVE (tunnel rule).
 */
export async function acceptInviteAction(formData: FormData) {
  const token = fStr(formData, "token");
  const name = fStr(formData, "name");
  const password = fStr(formData, "password");
  const confirm = fStr(formData, "confirm");

  if (password !== confirm) {
    redirect(`/portal/accept-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const result = await acceptPortalInvite(token, name, password);
  if (!result.ok) {
    redirect(`/portal/accept-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/portal/login?activated=1`);
}
