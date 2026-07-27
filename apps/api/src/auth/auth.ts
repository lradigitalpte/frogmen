import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAccessControl, organization } from "better-auth/plugins";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { eq, asc } from "drizzle-orm";
import { createDb, currencies, members, schema, sessions } from "@frog1/db";
import { sendPasswordResetEmail } from "./auth-email";

const organizationAccess = createAccessControl(defaultStatements);
const ownerRole = organizationAccess.newRole(defaultStatements);
const adminRole = organizationAccess.newRole({
  ...defaultStatements,
  organization: ["update"],
});
const managedMemberRole = organizationAccess.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
});

function resolveTrustedOrigins(): string[] {
  const values = [
    process.env.WEB_URL,
    process.env.BETTER_AUTH_URL,
    process.env.API_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.replace(/\/$/, ""));

  return [...new Set(values)];
}

export function createAuth(databaseUrl: string) {
  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!authSecret || authSecret.length < 32)
  ) {
    throw new Error(
      "BETTER_AUTH_SECRET must be configured with at least 32 characters in production",
    );
  }

  const db = createDb(databaseUrl);

  const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    basePath: "/api/auth",
    secret: authSecret,
    trustedOrigins: resolveTrustedOrigins(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          url,
        });
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 10,
        ac: organizationAccess,
        roles: {
          owner: ownerRole,
          admin: adminRole,
          manager: managedMemberRole,
          accountant: managedMemberRole,
          staff: managedMemberRole,
          viewer: managedMemberRole,
        },
        schema: {
          organization: {
            additionalFields: {
              baseCurrencyId: {
                type: "string",
                input: true,
                required: false,
              },
            },
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const defaultCode = process.env.DEFAULT_CURRENCY ?? "USD";
            const [currency] = await db
              .select({ id: currencies.id })
              .from(currencies)
              .where(eq(currencies.code, defaultCode))
              .limit(1);

            const slugBase =
              user.email?.split("@")[0]?.replace(/[^a-z0-9]+/gi, "-") ??
              `org-${user.id.slice(0, 8)}`;

            const org = await auth.api.createOrganization({
              body: {
                name: `${user.name ?? slugBase}'s Organization`,
                slug: `${slugBase}-${user.id.slice(0, 6)}`.toLowerCase(),
                userId: user.id,
                baseCurrencyId: currency?.id,
              },
            });

            if (org?.id) {
              await db
                .update(sessions)
                .set({ activeOrganizationId: org.id })
                .where(eq(sessions.userId, user.id));
            }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            if (session.activeOrganizationId) {
              return;
            }

            const [member] = await db
              .select({ organizationId: members.organizationId })
              .from(members)
              .where(eq(members.userId, session.userId))
              .orderBy(asc(members.createdAt))
              .limit(1);

            if (member) {
              await db
                .update(sessions)
                .set({ activeOrganizationId: member.organizationId })
                .where(eq(sessions.id, session.id));
            }
          },
        },
      },
    },
  });

  return auth;
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth(databaseUrl: string) {
  if (!authInstance) {
    authInstance = createAuth(databaseUrl);
  }

  return authInstance;
}

export type Auth = ReturnType<typeof createAuth>;
