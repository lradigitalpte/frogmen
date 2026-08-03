import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import {
  branchMembers,
  invitations,
  invitationBranches,
  members,
  type Database,
} from "@frog1/db";

export async function findPendingInvitationsForEmail(
  db: Database,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  return db
    .select()
    .from(invitations)
    .where(
      and(
        sql`lower(${invitations.email}) = ${normalizedEmail}`,
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.createdAt));
}

export async function assignInvitationBranches(
  db: Database,
  invitationId: string,
  memberId: string,
) {
  const branchRows = await db
    .select({ branchId: invitationBranches.branchId })
    .from(invitationBranches)
    .where(eq(invitationBranches.invitationId, invitationId));

  if (branchRows.length === 0) {
    return;
  }

  const [existing] = await db
    .select({ memberId: branchMembers.memberId })
    .from(branchMembers)
    .where(eq(branchMembers.memberId, memberId))
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(branchMembers).values(
    branchRows.map((row, index) => ({
      memberId,
      branchId: row.branchId,
      isPrimary: index === 0,
    })),
  );
}

export async function acceptInvitationForUser(
  db: Database,
  invitation: typeof invitations.$inferSelect,
  userId: string,
): Promise<{ memberId: string; organizationId: string }> {
  const [existingMember] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, invitation.organizationId),
        eq(members.userId, userId),
      ),
    )
    .limit(1);

  if (existingMember) {
    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, invitation.id));

    return {
      memberId: existingMember.id,
      organizationId: invitation.organizationId,
    };
  }

  const memberId = randomUUID();

  await db.transaction(async (transaction) => {
    await transaction.insert(members).values({
      id: memberId,
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role ?? "staff",
      createdAt: new Date(),
    });

    await transaction
      .update(invitations)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitations.id, invitation.id),
          eq(invitations.status, "pending"),
        ),
      );

    const branchRows = await transaction
      .select({ branchId: invitationBranches.branchId })
      .from(invitationBranches)
      .where(eq(invitationBranches.invitationId, invitation.id));

    if (branchRows.length > 0) {
      await transaction.insert(branchMembers).values(
        branchRows.map((row, index) => ({
          memberId,
          branchId: row.branchId,
          isPrimary: index === 0,
        })),
      );
    }
  });

  return { memberId, organizationId: invitation.organizationId };
}

export async function acceptPendingInvitationsForUser(
  db: Database,
  userId: string,
  email: string,
): Promise<string | null> {
  const pending = await findPendingInvitationsForEmail(db, email);
  if (pending.length === 0) {
    return null;
  }

  let primaryOrganizationId: string | null = null;

  for (const invitation of pending) {
    const result = await acceptInvitationForUser(db, invitation, userId);
    primaryOrganizationId ??= result.organizationId;
  }

  return primaryOrganizationId;
}
