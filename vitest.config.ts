import { defineConfig } from "vitest/config";
import path from "path";

// Vitest config — unit tests for the pure business-logic helpers
// (commissions, proration, renewals, lead scoring, aging, CSV, ...).
// No Next.js, no database: every test imports pure functions only.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
