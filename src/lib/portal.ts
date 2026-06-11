import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type PortalSession = {
  userId: string;
  clientId: string;
  name: string;
  email: string;
};

/**
 * Gate for every portal PAGE — called before the page's first query
 * (defense in depth on top of the middleware role wall). Anything that
 * isn't a linked CLIENT session is redirected OUT with a relative
 * redirect that returns, so no portal RSC payload is ever produced for
 * the wrong identity.
 */
export async function requirePortalSession(): Promise<PortalSession> {
  const session = await auth();
  if (!session?.userId) redirect("/portal/login");
  if (session.role !== "CLIENT") redirect("/dashboard");
  if (!session.clientId) {
    // CLIENT user whose Client link was severed — nothing to show.
    redirect("/portal/login?error=unlinked");
  }
  return {
    userId: session.userId,
    clientId: session.clientId,
    name: session.user?.name ?? "Client",
    email: session.user?.email ?? "",
  };
}
