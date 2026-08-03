import "./load-env";
import { runDatabaseSetup } from "./database-setup";

async function main() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const databaseName =
    process.env.MIGRATION_DATABASE_NAME ?? "frogmendash_db";

  if (!migrationUrl) {
    throw new Error("MIGRATION_DATABASE_URL is not configured");
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName)) {
    throw new Error("MIGRATION_DATABASE_NAME is invalid");
  }

  const target = new URL(migrationUrl);
  target.pathname = `/${databaseName}`;

  await runDatabaseSetup(target.toString());
  console.log(`[db] production database setup completed for ${databaseName}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
