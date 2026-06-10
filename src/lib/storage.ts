/**
 * Local file storage for document uploads. Files live under uploads/
 * (gitignored) with a random name; the original filename lives in the
 * DB row. Path traversal is impossible because we never use the client
 * filename on disk.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf", "text/", "application/msword", "application/vnd."];

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

export async function saveUpload(file: File): Promise<{ storedPath: string; sizeBytes: number }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 25 MB limit");
  if (!isAllowedMime(file.type || "application/octet-stream")) throw new Error(`File type ${file.type} not allowed`);
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const stored = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOADS_DIR, stored), buffer);
  return { storedPath: stored, sizeBytes: file.size };
}

/** Resolve a stored name to a readable stream; null when missing. */
export function openUpload(storedPath: string): NodeJS.ReadableStream | null {
  // storedPath is always our random hex name — but defend anyway.
  const safe = path.basename(storedPath);
  const full = path.join(UPLOADS_DIR, safe);
  if (!existsSync(full)) return null;
  return createReadStream(full);
}
