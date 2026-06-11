import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openUpload } from "@/lib/storage";

/**
 * Client-portal document download. Hard rules:
 *   - CLIENT session only (staff use /api/documents/[id]/download)
 *   - document must be visibleToClient
 *   - document must belong to the session's client (directly or via
 *     its policy/claim) — the clientId comes from the JWT, never the
 *     request
 * Anything else is a uniform 404 so ids can't be probed.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "CLIENT" || !session.clientId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const clientId = session.clientId;

  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      policy: { select: { clientId: true } },
      claim: { select: { clientId: true } },
    },
  });

  const owned =
    !!doc &&
    doc.visibleToClient &&
    (doc.clientId === clientId || doc.policy?.clientId === clientId || doc.claim?.clientId === clientId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stream = openUpload(doc.storedPath);
  if (!stream) return NextResponse.json({ error: "file missing on disk" }, { status: 410 });

  return new NextResponse(Readable.toWeb(stream as Readable) as ReadableStream, {
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "content-length": String(doc.sizeBytes),
    },
  });
}
