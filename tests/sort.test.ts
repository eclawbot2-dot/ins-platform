import { describe, expect, it } from "vitest";
import {
  applySort,
  buildSortHref,
  compareSortValues,
  nextDirection,
  parseSortParams,
  sortRows,
} from "@/lib/sort";

describe("compareSortValues", () => {
  it("sorts strings case-insensitively", () => {
    expect(compareSortValues("apple", "Banana")).toBeLessThan(0);
    expect(compareSortValues("Zed", "alpha")).toBeGreaterThan(0);
    expect(compareSortValues("same", "Same")).toBe(0);
  });

  it("sorts numbers numerically, not lexically", () => {
    expect(compareSortValues(9, 100)).toBeLessThan(0);
    expect(compareSortValues(2500.5, 2500.4)).toBeGreaterThan(0);
  });

  it("uses numeric collation for strings with embedded numbers", () => {
    expect(compareSortValues("POL-9", "POL-100")).toBeLessThan(0);
  });

  it("sorts dates by real date value, not display string", () => {
    // "Apr 1, 2026" < "Jan 5, 2026" as strings, but not as dates.
    const apr = new Date("2026-04-01");
    const jan = new Date("2026-01-05");
    expect(compareSortValues(apr, jan)).toBeGreaterThan(0);
  });

  it("sorts booleans false before true", () => {
    expect(compareSortValues(false, true)).toBeLessThan(0);
  });

  it("puts null/undefined/empty last", () => {
    expect(compareSortValues(null, "a")).toBeGreaterThan(0);
    expect(compareSortValues("a", undefined)).toBeLessThan(0);
    expect(compareSortValues("", "a")).toBeGreaterThan(0);
    expect(compareSortValues(null, undefined)).toBe(0);
  });
});

describe("sortRows", () => {
  const rows = [
    { name: "Charlie", premium: 1200, added: new Date("2026-03-01") },
    { name: "alice", premium: 50, added: new Date("2026-05-01") },
    { name: "Bob", premium: 9000, added: new Date("2026-01-01") },
  ];

  it("does not mutate the original array", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.name, "asc");
    expect(rows).toEqual(copy);
  });

  it("sorts ascending and descending", () => {
    expect(sortRows(rows, (r) => r.premium, "asc").map((r) => r.premium)).toEqual([50, 1200, 9000]);
    expect(sortRows(rows, (r) => r.premium, "desc").map((r) => r.premium)).toEqual([9000, 1200, 50]);
  });

  it("sorts dates by time", () => {
    expect(sortRows(rows, (r) => r.added, "asc").map((r) => r.name)).toEqual(["Bob", "Charlie", "alice"]);
  });

  it("keeps null values last in both directions", () => {
    const withNull = [{ v: null as number | null }, { v: 2 }, { v: 1 }];
    expect(sortRows(withNull, (r) => r.v, "asc").map((r) => r.v)).toEqual([1, 2, null]);
    expect(sortRows(withNull, (r) => r.v, "desc").map((r) => r.v)).toEqual([2, 1, null]);
  });

  it("is stable for equal keys", () => {
    const dup = [
      { id: 1, k: "a" },
      { id: 2, k: "a" },
      { id: 3, k: "a" },
    ];
    expect(sortRows(dup, (r) => r.k, "asc").map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe("parseSortParams", () => {
  it("accepts only known keys", () => {
    expect(parseSortParams("name", "desc", ["name", "email"])).toEqual({ sortKey: "name", sortDir: "desc" });
    expect(parseSortParams("evil", "desc", ["name"])).toEqual({ sortKey: undefined, sortDir: "desc" });
  });

  it("defaults direction to asc", () => {
    expect(parseSortParams("name", undefined, ["name"]).sortDir).toBe("asc");
    expect(parseSortParams("name", "sideways", ["name"]).sortDir).toBe("asc");
  });
});

describe("nextDirection", () => {
  it("toggles when active, resets to asc otherwise", () => {
    expect(nextDirection(true, "asc")).toBe("desc");
    expect(nextDirection(true, "desc")).toBe("asc");
    expect(nextDirection(false, "desc")).toBe("asc");
  });
});

describe("buildSortHref", () => {
  it("preserves filters, drops page, toggles direction", () => {
    const href = buildSortHref("/clients", { q: "acme", status: "ACTIVE", page: "3" }, "name", {
      sortKey: "name",
      sortDir: "asc",
    });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/clients");
    expect(url.searchParams.get("q")).toBe("acme");
    expect(url.searchParams.get("status")).toBe("ACTIVE");
    expect(url.searchParams.get("page")).toBeNull();
    expect(url.searchParams.get("sort")).toBe("name");
    expect(url.searchParams.get("dir")).toBe("desc");
  });

  it("starts a new column ascending", () => {
    const href = buildSortHref("/clients", {}, "email", { sortKey: "name", sortDir: "desc" });
    expect(href).toContain("sort=email");
    expect(href).toContain("dir=asc");
  });

  it("supports custom param names for multi-table pages", () => {
    const href = buildSortHref(
      "/compliance",
      { apptSort: "carrier", apptDir: "asc" },
      "premium",
      { sortKey: undefined, sortDir: "asc" },
      "eoSort",
      "eoDir",
    );
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("eoSort")).toBe("premium");
    expect(url.searchParams.get("eoDir")).toBe("asc");
    // the OTHER table's sort params are preserved
    expect(url.searchParams.get("apptSort")).toBe("carrier");
  });
});

describe("applySort", () => {
  const rows = [
    { name: "B", n: 2 },
    { name: "A", n: 1 },
  ];
  const accessors = { name: (r: { name: string }) => r.name };

  it("returns a copy in original order when no sort key", () => {
    const out = applySort(rows, accessors, { sortKey: undefined, sortDir: "asc" });
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it("sorts by the requested accessor", () => {
    const out = applySort(rows, accessors, { sortKey: "name", sortDir: "asc" });
    expect(out.map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("ignores unknown sort keys", () => {
    const out = applySort(rows, accessors, { sortKey: "nope", sortDir: "asc" });
    expect(out).toEqual(rows);
  });
});
