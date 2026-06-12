import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientUser } from "@/lib/auth";
import { portalPolicyWhere } from "@/lib/domain/portal-scope";
import { assembleIdCardInput } from "@/lib/documents/assemble";
import { renderIdCardHtml } from "@/lib/documents/id-card";

export const dynamic = "force-dynamic";

/**
 * Portal: printable auto ID card for the client's OWN policy. The policy
 * id is validated against the clientId-scoped where before rendering —
 * a foreign id 404s.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const session = await requireClientUser();
  const { policyId } = await params;

  const owned = await prisma.policy.findFirst({
    where: { id: policyId, ...portalPolicyWhere(session.clientId) },
    select: { id: true },
  });
  if (!owned) return new NextResponse("Not found", { status: 404 });

  const input = await assembleIdCardInput(policyId);
  if (!input) return new NextResponse("ID cards are only available for auto policies.", { status: 404 });

  return new NextResponse(renderIdCardHtml(input), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
