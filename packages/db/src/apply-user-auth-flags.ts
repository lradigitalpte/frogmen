import postgres from "postgres";

export async function applyUserAuthFlagsIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'must_change_password'
      ) AS exists
    `;

    if (!exists) {
      await sql`
        ALTER TABLE "users"
        ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false
      `;
      console.log("[db] users.must_change_password column applied");
    }
  } finally {
    await sql.end();
  }
}
