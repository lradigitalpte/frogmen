import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_PUBLIC_URL ??
  (process.env.DATABASE_URL?.includes("railway.internal")
    ? undefined
    : process.env.DATABASE_URL);

if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set or only an internal Railway URL is available. Use DATABASE_PUBLIC_URL.",
  );
  process.exit(1);
}

const targetDatabase = process.env.TARGET_DATABASE ?? "frogmendash_db";
const appUser = process.env.TARGET_DB_USER ?? "frogmendash_user";
const resetDatabase = process.env.RESET_FROGMEN_DB === "true";

const adminBaseUrl = new URL(databaseUrl);
const adminDbUrl = new URL(databaseUrl);
adminDbUrl.pathname = `/${targetDatabase}`;

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function resetFrogmenDatabase(adminSql: postgres.Sql) {
  console.log(`Resetting ${targetDatabase} with owner ${appUser}...`);

  await adminSql.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${targetDatabase.replace(/'/g, "''")}' AND pid <> pg_backend_pid()`,
  );
  await adminSql.unsafe(`DROP DATABASE IF EXISTS ${quoteIdent(targetDatabase)}`);
  await adminSql.unsafe(
    `CREATE DATABASE ${quoteIdent(targetDatabase)} OWNER ${quoteIdent(appUser)}`,
  );

  console.log(`Recreated ${targetDatabase} owned by ${appUser}.`);
}

async function transferOwnership(sql: postgres.Sql) {
  const [{ current_database, current_user }] = await sql<
    { current_database: string; current_user: string }[]
  >`SELECT current_database(), current_user`;
  console.log(`Connected as ${current_user} to ${current_database}`);

  const owners = await sql<{ owner: string; count: string }[]>`
    SELECT pg_get_userbyid(c.relowner) AS owner, COUNT(*)::text AS count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'drizzle')
      AND c.relkind IN ('r', 'S', 'v', 'm')
    GROUP BY pg_get_userbyid(c.relowner)
    ORDER BY owner
  `;
  console.log("Object owners:", owners);

  for (const { owner } of owners) {
    if (owner === appUser) continue;
    console.log(`Reassigning objects owned by ${owner} to ${appUser}...`);
    await sql.unsafe(
      `REASSIGN OWNED BY ${quoteIdent(owner)} TO ${quoteIdent(appUser)}`,
    );
  }

  await sql.unsafe(`ALTER SCHEMA public OWNER TO ${quoteIdent(appUser)}`);
  await sql.unsafe(`ALTER SCHEMA drizzle OWNER TO ${quoteIdent(appUser)}`);
  await sql.unsafe(
    `GRANT ALL ON SCHEMA public TO ${quoteIdent(appUser)}`,
  );
  await sql.unsafe(
    `GRANT ALL ON SCHEMA drizzle TO ${quoteIdent(appUser)}`,
  );
  await sql.unsafe(
    `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${quoteIdent(appUser)}`,
  );
  await sql.unsafe(
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(appUser)}`,
  );
  await sql.unsafe(
    `GRANT ALL ON ALL TABLES IN SCHEMA drizzle TO ${quoteIdent(appUser)}`,
  );
  await sql.unsafe(
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA drizzle TO ${quoteIdent(appUser)}`,
  );

  console.log("Ownership transfer complete.");
}

async function dropRuntimeRole(adminSql: postgres.Sql) {
  console.log("Dropping stale cluster role frog1_runtime...");
  await adminSql.unsafe(`DROP ROLE IF EXISTS frog1_runtime`);
  console.log("Dropped frog1_runtime.");
}

async function provisionRuntimeRole(adminSql: postgres.Sql) {
  console.log(`Provisioning frog1_runtime for ${appUser}...`);

  await adminSql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'frog1_runtime') THEN
        CREATE ROLE frog1_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      END IF;
    END
    $$;
  `);

  await adminSql.unsafe(
    `GRANT frog1_runtime TO ${quoteIdent(appUser)} WITH ADMIN OPTION`,
  );

  const adminDbSql = postgres(adminDbUrl.toString(), { max: 1 });
  try {
    await adminDbSql.unsafe(`GRANT USAGE ON SCHEMA public TO frog1_runtime`);
    await adminDbSql.unsafe(`
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON ALL TABLES IN SCHEMA public TO frog1_runtime
    `);
    await adminDbSql.unsafe(`
      GRANT USAGE, SELECT
        ON ALL SEQUENCES IN SCHEMA public TO frog1_runtime
    `);
    await adminDbSql.unsafe(`
      GRANT EXECUTE
        ON ALL FUNCTIONS IN SCHEMA public TO frog1_runtime
    `);
    await adminDbSql.unsafe(`
      ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(appUser)} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frog1_runtime
    `);
    await adminDbSql.unsafe(`
      ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(appUser)} IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO frog1_runtime
    `);
    await adminDbSql.unsafe(`
      ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(appUser)} IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO frog1_runtime
    `);
  } finally {
    await adminDbSql.end();
  }

  console.log("Provisioned frog1_runtime and applied runtime grants.");
}

async function main() {
  if (process.env.PROVISION_RUNTIME_ROLE === "true") {
    const adminSql = postgres(adminBaseUrl.toString(), { max: 1 });
    try {
      await provisionRuntimeRole(adminSql);
    } finally {
      await adminSql.end();
    }
    return;
  }

  if (process.env.DROP_RUNTIME_ROLE === "true") {
    const adminSql = postgres(adminBaseUrl.toString(), { max: 1 });
    try {
      await dropRuntimeRole(adminSql);
    } finally {
      await adminSql.end();
    }
    return;
  }

  if (resetDatabase) {
    const adminSql = postgres(adminBaseUrl.toString(), { max: 1 });
    try {
      await resetFrogmenDatabase(adminSql);
    } finally {
      await adminSql.end();
    }
    return;
  }

  const sql = postgres(adminDbUrl.toString(), { max: 1 });
  try {
    await transferOwnership(sql);
  } finally {
    await sql.end();
  }
}

main().catch((error: Error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
