import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * ins-platform runs on PostgreSQL via the @prisma/adapter-pg driver adapter.
 * Connection string comes from DATABASE_URL, e.g.
 *   postgresql://ins:ins_dev@127.0.0.1:5432/ins?schema=public
 *
 * Currency-bearing columns are Prisma `Decimal` -> Postgres NUMERIC, so
 * sums stay exact (no binary-float drift).
 */
function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) {
    throw new Error(
      "DATABASE_URL is not set. ins-platform requires a PostgreSQL connection string, " +
        "e.g. postgresql://ins:ins_dev@127.0.0.1:5432/ins?schema=public",
    );
  }
  if (!configured.startsWith("postgres://") && !configured.startsWith("postgresql://")) {
    throw new Error(
      `DATABASE_URL must be a Postgres URL (postgres:// or postgresql://); got "${configured.slice(0, 12)}…".`,
    );
  }
  return configured;
}

function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
