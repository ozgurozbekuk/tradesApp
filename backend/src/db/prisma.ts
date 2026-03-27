// Creates the shared Prisma database client for backend services.
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

const createPrismaClient = () => {
  try {
    // Prisma 7 requires an adapter (or Accelerate URL).
    // Neon is standard Postgres, so adapter-pg is reliable for MVP.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as {
      Pool: new (config: { connectionString: string }) => unknown;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg") as {
      PrismaPg: new (pool: unknown) => unknown;
    };

    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({ adapter: adapter as never });
  } catch {
    throw new Error(
      "Prisma 7 requires a database adapter. Install: npm install @prisma/adapter-pg pg"
    );
  }
};

export const prisma = createPrismaClient();
