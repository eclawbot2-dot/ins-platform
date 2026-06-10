import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // ins-platform runs on PostgreSQL — DATABASE_URL must be a
    // postgres:// URL. See RUNBOOK.md for the local connection string.
    url: process.env["DATABASE_URL"] ?? "",
  },
});
