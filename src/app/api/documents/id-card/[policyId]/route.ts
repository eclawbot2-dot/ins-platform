import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assembleIdCardInput } from "@/lib/documents/assemble";
import { renderIdCardHtml } from "@/lib/documents/id-card";

export const dynamic = "force-dynamic";

/** Staff: printable auto ID card for a policy. */
export async function GET(_req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const session = await requireSession();
  const { policyId } = await params;
  const input = await assembleIdCardInput(policyId);
  if (!input) {
    return new NextResponse("ID cards are only available for auto policies.", { status: 404 });
  }
  await audit({ userId: session.userId, action: "ID_CARD_GENERATE", entityType: "Policy", entityId: policyId, detail: input.policyNumber });
  return new NextResponse(renderIdCardHtml(input), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
