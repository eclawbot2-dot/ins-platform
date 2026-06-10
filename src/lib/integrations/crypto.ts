/**
 * Token encryption for IntegrationConnection persistence. AES-256-GCM
 * with key material derived (SHA-256) from AUTH_SECRET.
 *
 * Format on disk: <12-byte iv hex>.<16-byte authTag hex>.<ciphertext hex>
 */

import crypto from "node:crypto";

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for token encryption.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`;
}

export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  const parts = ciphertext.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0]!, "hex");
    const tag = Buffer.from(parts[1]!, "hex");
    const enc = Buffer.from(parts[2]!, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
