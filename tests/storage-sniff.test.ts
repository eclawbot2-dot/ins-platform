import { describe, it, expect } from "vitest";
import { sniffBinaryMime, mimeMatchesBytes, isAllowedMime } from "@/lib/storage";

const sig = (...bytes: number[]) => new Uint8Array(bytes);

describe("sniffBinaryMime — magic-byte detection for the public upload funnel", () => {
  it("detects PDF (%PDF)", () => {
    expect(sniffBinaryMime(sig(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe("application/pdf");
  });
  it("detects PNG", () => {
    expect(sniffBinaryMime(sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });
  it("detects JPEG (FF D8 FF)", () => {
    expect(sniffBinaryMime(sig(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });
  it("detects GIF87a and GIF89a", () => {
    expect(sniffBinaryMime(sig(0x47, 0x49, 0x46, 0x38, 0x37, 0x61))).toBe("image/gif");
    expect(sniffBinaryMime(sig(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
  });
  it("detects WEBP (RIFF....WEBP)", () => {
    expect(sniffBinaryMime(sig(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("returns null for unknown / spoofed bytes (e.g. an MZ exe header)", () => {
    expect(sniffBinaryMime(sig(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // MZ
    expect(sniffBinaryMime(sig(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffBinaryMime(sig())).toBeNull();
  });
});

describe("mimeMatchesBytes — declared type must agree with the sniffed bytes", () => {
  it("rejects an exe declared as application/pdf (sniff null)", () => {
    expect(mimeMatchesBytes("application/pdf", sniffBinaryMime(sig(0x4d, 0x5a)))).toBe(false);
  });
  it("accepts a real PDF declared as application/pdf", () => {
    expect(mimeMatchesBytes("application/pdf", sniffBinaryMime(sig(0x25, 0x50, 0x44, 0x46)))).toBe(true);
  });
  it("accepts image/jpg alias against jpeg bytes", () => {
    expect(mimeMatchesBytes("image/jpg", "image/jpeg")).toBe(true);
    expect(mimeMatchesBytes("image/jpeg", "image/jpeg")).toBe(true);
  });
  it("rejects a PNG declared as application/pdf (mismatch)", () => {
    expect(mimeMatchesBytes("application/pdf", "image/png")).toBe(false);
  });
  it("rejects when sniff is null regardless of declaration", () => {
    expect(mimeMatchesBytes("image/png", null)).toBe(false);
  });
});

describe("isAllowedMime — declared-type allowlist still in force", () => {
  it("allows pdf/images/text/office", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("image/png")).toBe(true);
    expect(isAllowedMime("text/plain")).toBe(true);
    expect(isAllowedMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });
  it("blocks executables / octet-stream", () => {
    expect(isAllowedMime("application/octet-stream")).toBe(false);
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
  });
});
