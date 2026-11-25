import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl, organization } from "better-auth/plugins";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { eq, asc } from "drizzle-orm";
import { createDb, currencies, members, schema, sessions } from "@frog1/db";
import { sendPasswordResetEmail } from "./auth-email";
import {
  acceptInvitationForUser,
  assignInvitationBranches,
  findPendingInvitation,
} from "./invite-acceptance";
import { provisionOrgInventory } from "../inventory/org-inventory-seed";
import { isReservedPlatformAdminEmail } from "../platform/platform-admin";

const organizationAccess = createAccessControl(defaultStatements);
const ownerRole = organizationAccess.newRole(defaultStatements);
// Members and invitations are managed through /v1/members, which applies our own
// rules (e.g. only the owner can remove an admin). Better Auth's endpoints would bypass them.
const adminRole = organizationAccess.newRole({
  organization: ["update"],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
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
    user: {
      additionalFields: {
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Otherwise whoever held the account before the reset stays signed in.
      revokeSessionsOnPasswordReset: true,
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
        allowUserToCreateOrganization: false,
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
        organizationHooks: {
          afterAcceptInvitation: async ({ invitation, member }) => {
            await assignInvitationBranches(db, invitation.id, member.id);
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = user.email?.trim();
            if (!email) {
              throw new APIError("BAD_REQUEST", {
                message: "A valid email is required.",
              });
            }
            if (isReservedPlatformAdminEmail(email)) {
              throw new APIError("FORBIDDEN", {
                message: "This email address can't be used to create an account.",
              });
            }
          },
          after: async (user, context) => {
            // Sent by the sign-up form when it was opened from an invitation link.
            const invitationId = context?.headers?.get("x-invitation-id");
            if (invitationId && user.email) {
              const invitation = await findPendingInvitation(
                db,
                invitationId,
                user.email,
              );
              if (invitation) {
                // The session created next picks this membership up as its active organization.
                await acceptInvitationForUser(db, invitation, user.id);
                return;
              }
            }

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
              await provisionOrgInventory(db, org.id);
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
