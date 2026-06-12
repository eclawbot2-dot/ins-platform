import { describe, it, expect } from "vitest";
import { xDateBucket, isXDateDue, dueXDates, bucketCounts } from "@/lib/domain/xdates";

const asOf = new Date("2026-06-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("xDateBucket", () => {
  it("buckets past X-dates as OVERDUE", () => {
    expect(xDateBucket(d("2026-06-01"), asOf)).toBe("OVERDUE");
  });
  it("buckets the 30/60/90 boundaries inclusively", () => {
    expect(xDateBucket(d("2026-07-10"), asOf)).toBe("DUE_30");
    expect(xDateBucket(d("2026-08-09"), asOf)).toBe("DUE_60");
    expect(xDateBucket(d("2026-09-08"), asOf)).toBe("DUE_90");
  });
  it("buckets beyond 90 days as LATER", () => {
    expect(xDateBucket(d("2026-12-01"), asOf)).toBe("LATER");
  });
  it("treats same-day as DUE_30, not overdue", () => {
    expect(xDateBucket(d("2026-06-10"), asOf)).toBe("DUE_30");
  });
});

describe("isXDateDue", () => {
  it("includes overdue X-dates in the due window", () => {
    expect(isXDateDue(d("2026-05-01"), asOf)).toBe(true);
  });
  it("is true within the default 90-day window", () => {
    expect(isXDateDue(d("2026-09-01"), asOf)).toBe(true);
  });
  it("is false beyond the window", () => {
    expect(isXDateDue(d("2026-10-01"), asOf)).toBe(false);
  });
  it("respects a custom window", () => {
    expect(isXDateDue(d("2026-07-05"), asOf, 30)).toBe(true);
    expect(isXDateDue(d("2026-08-05"), asOf, 30)).toBe(false);
  });
});

describe("dueXDates", () => {
  const items = [
    { id: "later", expirationDate: d("2026-12-01") },
    { id: "overdue", expirationDate: d("2026-05-01") },
    { id: "soon", expirationDate: d("2026-07-01") },
  ];
  it("filters to the window and sorts soonest/most-overdue first", () => {
    const out = dueXDates(items, asOf);
    expect(out.map((x) => x.id)).toEqual(["overdue", "soon"]);
  });
  it("excludes items beyond the window", () => {
    expect(dueXDates(items, asOf).some((x) => x.id === "later")).toBe(false);
  });
});

describe("bucketCounts", () => {
  it("tallies each bucket", () => {
    const counts = bucketCounts(
      [
        { expirationDate: d("2026-05-01") }, // overdue
        { expirationDate: d("2026-06-20") }, // due 30
        { expirationDate: d("2026-07-05") }, // due 30
        { expirationDate: d("2026-08-01") }, // due 60
        { expirationDate: d("2026-12-01") }, // later
      ],
      asOf,
    );
    expect(counts.OVERDUE).toBe(1);
    expect(counts.DUE_30).toBe(2);
    expect(counts.DUE_60).toBe(1);
    expect(counts.DUE_90).toBe(0);
    expect(counts.LATER).toBe(1);
  });
});
