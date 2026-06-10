import { describe, it, expect } from "vitest";
import { isSafeRedirect } from "@/lib/redirect";

describe("isSafeRedirect", () => {
  it("accepts same-origin relative paths", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/clients?status=ACTIVE")).toBe(true);
  });
  it("rejects empty and non-leading-slash strings", () => {
    expect(isSafeRedirect("")).toBe(false);
    expect(isSafeRedirect("dashboard")).toBe(false);
    expect(isSafeRedirect("https://evil.com")).toBe(false);
  });
  it("rejects protocol-relative and backslash tricks", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("/\\evil.com")).toBe(false);
  });
  it("rejects smuggled schemes", () => {
    expect(isSafeRedirect("/javascript:alert(1)")).toBe(false);
  });
});
