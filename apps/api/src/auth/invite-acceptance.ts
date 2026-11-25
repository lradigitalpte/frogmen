import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  branchMembers,
  invitations,
  invitationBranches,
  members,
  type Database,
} from "@frog1/db";

/**
 * The pending invitation a new account may join. Emails are not verified at
 * sign-up, so a matching address alone proves nothing: the caller must also
 * hold the unguessable invitation id that was emailed to the invited person.
 */
export async function findPendingInvitation(
  db: Database,
  invitationId: string,
  email: string,
) {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        sql`lower(${invitations.email}) = ${email.trim().toLowerCase()}`,
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invitation ?? null;
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

  await db
    .insert(branchMembers)
    .values(
      branchRows.map((row, index) => ({
        memberId,
        branchId: row.branchId,
        isPrimary: index === 0,
      })),
    )
    .onConflictDoNothing({
      target: [branchMembers.branchId, branchMembers.memberId],
    });
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
      await transaction
        .insert(branchMembers)
        .values(
          branchRows.map((row, index) => ({
            memberId,
            branchId: row.branchId,
            isPrimary: index === 0,
          })),
        )
        .onConflictDoNothing({
          target: [branchMembers.branchId, branchMembers.memberId],
        });
    }
  });

  return { memberId, organizationId: invitation.organizationId };
}
