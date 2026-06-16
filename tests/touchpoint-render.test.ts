import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  renderEmail,
  salutation,
  senderFooterText,
  wrapHtml,
  type MergeContext,
} from "@/lib/touchpoint-render";

const ctx = (over: Partial<MergeContext> = {}): MergeContext => ({
  client: { name: "Walter & Janet Simmons", preferredName: "Walt", firstName: "Walter", email: "w@example.com" },
  agency: { name: "Tabor Agency", phone: "843-555-0100", email: "office@taboragency.com", address: "665 Johnnie Dodds, Suite 234, Mount Pleasant SC 29464" },
  producerName: "Sarah Mitchell",
  csrName: "Molly Tran",
  tenureYears: "3",
  unsubscribeUrl: "https://portal.taboragency.com/unsubscribe?token=tok123",
  ...over,
});

describe("salutation", () => {
  it("prefers preferredName, then firstName, then full name", () => {
    expect(salutation(ctx().client)).toBe("Walt");
    expect(salutation({ name: "Acme Co", preferredName: null, firstName: null })).toBe("Acme Co");
    expect(salutation({ name: "", preferredName: null, firstName: null })).toBe("there");
  });
});

describe("renderTemplate", () => {
  it("resolves known merge fields", () => {
    const out = renderTemplate("Hi {{firstName}}, from {{agencyName}} ({{agencyPhone}}).", ctx());
    expect(out).toBe("Hi Walt, from Tabor Agency (843-555-0100).");
  });
  it("renders missing/unknown fields as empty string — never literal braces", () => {
    const out = renderTemplate("Policy {{policyNumber}} | {{unknownField}}!", ctx());
    expect(out).toBe("Policy  | !");
    expect(out).not.toContain("{{");
  });
  it("resolves policy + invoice + claim merge fields when present", () => {
    const c = ctx({
      policy: { policyNumber: "HO-123", lineOfBusiness: "Homeowners", carrierName: "Travelers", expirationDate: "Sep 1, 2026" },
      invoice: { invoiceNumber: "INV-9", amount: "$1,200.00", dueDate: "Jul 1, 2026" },
      claim: { claimNumber: "CLM-7", status: "CLOSED", dateOfLoss: "Jun 1, 2026" },
      payNowUrl: "https://in.xero.com/pay/abc",
    });
    const out = renderTemplate("{{policyNumber}} {{lineOfBusiness}} {{invoiceNumber}} {{invoiceAmount}} {{claimNumber}} {{payNowUrl}}", c);
    expect(out).toBe("HO-123 Homeowners INV-9 $1,200.00 CLM-7 https://in.xero.com/pay/abc");
  });
});

describe("senderFooterText", () => {
  it("includes sender identity + the unsubscribe URL", () => {
    const footer = senderFooterText(ctx());
    expect(footer).toContain("Tabor Agency");
    expect(footer).toContain("843-555-0100");
    expect(footer).toContain("https://portal.taboragency.com/unsubscribe?token=tok123");
  });
});

describe("wrapHtml", () => {
  it("produces HTML with the agency header, paragraphs, and unsubscribe link", () => {
    const html = wrapHtml("Hi Walt,\n\nHappy birthday!", ctx());
    expect(html).toContain("Tabor Agency");
    expect(html).toContain("Happy birthday!");
    expect(html).toContain('href="https://portal.taboragency.com/unsubscribe?token=tok123"');
  });
  it("escapes HTML-special characters in the body", () => {
    const html = wrapHtml("5 < 6 & <b>bold</b>", ctx());
    expect(html).toContain("5 &lt; 6 &amp; &lt;b&gt;bold&lt;/b&gt;");
  });
});

describe("renderEmail", () => {
  it("returns subject + text (with footer) + html", async () => {
    const out = await renderEmail("Happy Birthday, {{firstName}}!", "Hi {{firstName}},\n\nWishing you the best.", ctx());
    expect(out.subject).toBe("Happy Birthday, Walt!");
    expect(out.text).toContain("Hi Walt,");
    expect(out.text).toContain("unsubscribe"); // footer present
    expect(out.html).toContain("<p");
  });
  it("falls back to seeded copy when a personalizer throws (never blocks a send)", async () => {
    const out = await renderEmail("Subj {{firstName}}", "Body {{firstName}}", ctx(), {
      personalize: async () => {
        throw new Error("AI down");
      },
    });
    expect(out.subject).toBe("Subj Walt");
    expect(out.text).toContain("Body Walt");
  });
  it("applies a successful personalizer rewrite (still re-resolving merge fields)", async () => {
    const out = await renderEmail("Subj", "Body", ctx(), {
      personalize: async () => ({ subject: "New {{firstName}}", body: "Rewritten {{agencyName}}" }),
    });
    expect(out.subject).toBe("New Walt");
    expect(out.text).toContain("Rewritten Tabor Agency");
  });
  it("personal mode (client-specific, non-marketing) appends NO footer — no unsubscribe, no address/phone", async () => {
    const out = await renderEmail("Happy Birthday, {{firstName}}!", "Hi {{firstName}},\n\nWishing you the best.", ctx(), { personal: true });
    expect(out.text).not.toContain("unsubscribe");
    expect(out.text).not.toContain("You're receiving this");
    expect(out.html).not.toContain("unsubscribe");
    // address + phone are removed from personal emails entirely
    expect(out.text).not.toContain("665 Johnnie Dodds");
    expect(out.text).not.toContain("843-555-0100");
    expect(out.html).not.toContain("665 Johnnie Dodds");
    expect(out.html).not.toContain("843-555-0100");
    // the body sign-off is the last thing the client sees
    expect(out.text.trim().endsWith("Wishing you the best.")).toBe(true);
  });
});
