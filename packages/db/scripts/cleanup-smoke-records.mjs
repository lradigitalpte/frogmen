import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: "../../.env" });

const execute = process.argv.includes("--execute");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const smokeUserWhere = `
  email LIKE ANY (
    ARRAY[
      'branch-smoke-%@example.test',
      'isolation-smoke-%@example.test',
      'isolation-detail-%@example.test',
      'rls-smoke-%@example.test',
      'number-smoke-%@example.test'
    ]
  )
`;

try {
  const matchingUsers = await sql.unsafe(
    `SELECT id, email FROM users WHERE ${smokeUserWhere} ORDER BY email`,
  );
  const userIds = matchingUsers.map(({ id }) => id);

  const organizationRows =
    userIds.length === 0
      ? []
      : await sql.unsafe(
          `
            SELECT DISTINCT o.id, o.name
            FROM organizations o
            JOIN members m ON m.organization_id = o.id
            WHERE m.user_id = ANY($1::text[])
            ORDER BY o.name
          `,
          [userIds],
        );
  const organizationIds = organizationRows.map(({ id }) => id);

  const nonSmokeMembers =
    organizationIds.length === 0
      ? []
      : await sql.unsafe(
          `
            SELECT DISTINCT u.email, m.organization_id
            FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE m.organization_id = ANY($1::text[])
              AND NOT (${smokeUserWhere})
          `,
          [organizationIds],
        );

  if (nonSmokeMembers.length > 0) {
    throw new Error(
      `Cleanup aborted: ${nonSmokeMembers.length} non-smoke member(s) belong to matched organizations.`,
    );
  }

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          users: matchingUsers.map(({ email }) => email),
          organizations: organizationRows.map(({ name }) => name),
        },
        null,
        2,
      ),
    );
  } else {
    const deleted = await sql.begin(async (transaction) => {
      let deletedAuditLogs = [];

      if (organizationIds.length > 0) {
        await transaction.unsafe(
          'ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable',
        );
        deletedAuditLogs = await transaction.unsafe(
          "DELETE FROM audit_logs WHERE organization_id = ANY($1::text[]) RETURNING id",
          [organizationIds],
        );
      }

      const deletedUsers =
        userIds.length === 0
          ? []
          : await transaction.unsafe(
              "DELETE FROM users WHERE id = ANY($1::text[]) RETURNING id",
              [userIds],
            );

      const deletedOrganizations =
        organizationIds.length === 0
          ? []
          : await transaction.unsafe(
              "DELETE FROM organizations WHERE id = ANY($1::text[]) RETURNING id",
              [organizationIds],
            );

      if (organizationIds.length > 0) {
        await transaction.unsafe(
          'ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_immutable',
        );
      }

      return {
        auditLogs: deletedAuditLogs.length,
        organizations: deletedOrganizations.length,
        users: deletedUsers.length,
      };
    });

    console.log(JSON.stringify({ mode: "execute", deleted }, null, 2));
  }
} finally {
  await sql.end();
}
