import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openUpload } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

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
