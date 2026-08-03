import "./load-env";
import { runDatabaseSetup } from "./database-setup";

async function main() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const databaseName =
    process.env.MIGRATION_DATABASE_NAME ?? "frogmendash_db";

  if (!migrationUrl) {
    const fallbackUrl = process.env.DATABASE_URL?.trim();
    if (fallbackUrl) {
      console.warn(
        "[db] MIGRATION_DATABASE_URL is not set; falling back to DATABASE_URL",
      );
      await runDatabaseSetup(fallbackUrl);
      console.log("[db] production database setup completed using DATABASE_URL");
      return;
    }

    throw new Error(
      "MIGRATION_DATABASE_URL is not configured. On Railway, set MIGRATION_DATABASE_URL to your Postgres service DATABASE_URL (e.g. ${{Postgres.DATABASE_URL}}) and MIGRATION_DATABASE_NAME to the target database.",
    );
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
