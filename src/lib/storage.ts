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

/**
 * Magic-byte sniff for the binary upload types the public funnel actually
 * processes (PDF + the images the AI extractor accepts). Returns the
 * content-derived MIME, or null when the leading bytes don't match a known
 * signature. Used to verify a PUBLIC upload's bytes match its declared type
 * before we trust/store it — a client controls Content-Type, not the bytes.
 *
 * Text/Office formats have no single reliable signature; the public funnel
 * only attaches PDFs/images, so an unrecognized signature on the public path
 * is rejected rather than guessed.
 */
export function sniffBinaryMime(bytes: Uint8Array): string | null {
  const b = bytes;
  // %PDF
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  // PNG \x89PNG\r\n\x1a\n
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  // JPEG FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // GIF87a / GIF89a
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  // WEBP: RIFF....WEBP
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** True iff a declared image/pdf MIME is consistent with the sniffed bytes. */
export function mimeMatchesBytes(declared: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  if (sniffed === "image/jpeg") return declared === "image/jpeg" || declared === "image/jpg";
  return declared === sniffed;
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
