import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import {
  accounts,
  branchMembers,
  members,
  users,
  type Database,
} from "@frog1/db";

export function generateTemporaryPassword(length = 14): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export async function provisionOrganizationUser(
  db: Database,
  input: {
    name: string;
    email: string;
    organizationId: string;
    role: string;
    branchIds: string[];
  },
): Promise<{ userId: string; memberId: string; temporaryPassword: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword();
  const userId = randomUUID();
  const memberId = randomUUID();
  const accountId = randomUUID();
  const hashedPassword = await hashPassword(temporaryPassword);

  await db.transaction(async (transaction) => {
    await transaction.insert(users).values({
      id: userId,
      name: input.name.trim(),
      email: normalizedEmail,
      emailVerified: false,
      mustChangePassword: true,
    });

    await transaction.insert(accounts).values({
      id: accountId,
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashedPassword,
    });

    await transaction.insert(members).values({
      id: memberId,
      organizationId: input.organizationId,
      userId,
      role: input.role,
      createdAt: new Date(),
    });

    if (input.branchIds.length > 0) {
      await transaction.insert(branchMembers).values(
        input.branchIds.map((branchId, index) => ({
          memberId,
          branchId,
          isPrimary: index === 0,
        })),
      );
    }
  });

  return { userId, memberId, temporaryPassword };
}

export async function findUserAuthFlags(db: Database, userId: string) {
  const [user] = await db
    .select({
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function clearMustChangePassword(db: Database, userId: string) {
  await db
    .update(users)
    .set({ mustChangePassword: false })
    .where(eq(users.id, userId));
}

export async function updateUserCredentialPassword(
  db: Database,
  userId: string,
  newPassword: string,
) {
  const hashedPassword = await hashPassword(newPassword);
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
    )
    .limit(1);

  if (!account) {
    throw new Error("Credential account not found");
  }

  await db
    .update(accounts)
    .set({ password: hashedPassword })
    .where(eq(accounts.id, account.id));
}
