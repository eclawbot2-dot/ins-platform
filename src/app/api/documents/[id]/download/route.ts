import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Staff-only: 401 on no session, 403 on a CLIENT (portal) session. Documents
  // are book-wide for staff, but a portal client must never reach this raw-bytes
  // route — they have a separate, visibility-gated portal download endpoint.
  const gate = await requireApiSession();
  if (gate instanceof Response) return gate;

  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stream = openUpload(doc.storedPath);
  if (!stream) return NextResponse.json({ error: "file missing on disk" }, { status: 410 });

  // Audit the download (who pulled which document's bytes) — staff route.
  await audit({
    userId: gate.userId,
    action: "DOCUMENT_DOWNLOAD",
    entityType: "Document",
    entityId: doc.id,
    detail: doc.fileName,
  });

  return new NextResponse(Readable.toWeb(stream as Readable) as ReadableStream, {
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "content-length": String(doc.sizeBytes),
    },
  });
}
