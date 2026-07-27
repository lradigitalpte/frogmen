import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = join(__dirname, "../drizzle");

export async function runMigrations(connectionString: string) {
  const client = postgres(connectionString, {
    max: 1,
    onnotice: () => {},
  });

  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log("[db] migrations applied");
  } finally {
    await client.end();
  }
}
