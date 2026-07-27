import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  branchMembers,
  branches,
  invitations,
  invitationBranches,
  members,
  organizations,
  users,
  type Database,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { MailService } from "../mail/mail.service";
import { normalizeRole, ROLES, type AppRole } from "./permissions";
import type { SecurityContext } from "./security-context";

@Injectable()
export class MembersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        name: users.name,
        email: users.email,
        role: members.role,
        createdAt: members.createdAt,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.organizationId, organizationId))
      .orderBy(asc(users.name));

    const assignments = await this.db
      .select({
        memberId: branchMembers.memberId,
        branchId: branches.id,
        branchName: branches.name,
        isPrimary: branchMembers.isPrimary,
      })
      .from(branchMembers)
      .innerJoin(branches, eq(branches.id, branchMembers.branchId))
      .where(eq(branches.organizationId, organizationId));

    return rows.map((member) => ({
      ...member,
      role: normalizeRole(member.role),
      branches: assignments.filter(
        (assignment) => assignment.memberId === member.id,
      ),
    }));
  }

  async update(
    context: SecurityContext,
    memberId: string,
    input: { role?: string; branchIds?: string[]; primaryBranchId?: string },
  ) {
    const [target] = await this.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!target) throw new NotFoundException("Member not found");

    const currentRole = normalizeRole(target.role);
    if (currentRole === "owner" && context.role !== "owner") {
      throw new ForbiddenException("Only the owner can modify the owner");
    }

    const nextRole = input.role
      ? normalizeRole(input.role)
      : currentRole;
    if (input.role && !ROLES.includes(input.role as AppRole)) {
      throw new BadRequestException("Invalid role");
    }
    if (nextRole === "owner" && currentRole !== "owner") {
      throw new BadRequestException("Ownership transfer is not supported");
    }

    await this.db.transaction(async (transaction) => {
      if (input.role) {
        await transaction
          .update(members)
          .set({ role: nextRole })
          .where(eq(members.id, memberId));
      }

      if (input.branchIds) {
        const uniqueIds = [...new Set(input.branchIds)];
        if (uniqueIds.length === 0 && !["owner", "admin"].includes(nextRole)) {
          throw new BadRequestException(
            "Non-admin members require at least one branch",
          );
        }
        if (uniqueIds.length > 0) {
          const valid = await transaction
            .select({ id: branches.id })
            .from(branches)
            .where(
              and(
                eq(branches.organizationId, context.organizationId),
                eq(branches.isActive, true),
                inArray(branches.id, uniqueIds),
              ),
            );
          if (valid.length !== uniqueIds.length) {
            throw new BadRequestException("One or more branches are invalid");
          }
        }

        await transaction
          .delete(branchMembers)
          .where(eq(branchMembers.memberId, memberId));
        if (uniqueIds.length > 0) {
          await transaction.insert(branchMembers).values(
            uniqueIds.map((branchId, index) => ({
              memberId,
              branchId,
              isPrimary:
                input.primaryBranchId === branchId ||
                (!input.primaryBranchId && index === 0),
            })),
          );
        }
      }
    });
    return this.list(context.organizationId);
  }

  async listInvitations(organizationId: string) {
    const rows = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        inviterName: users.name,
      })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.inviterId))
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(desc(invitations.createdAt));

    const assignments = await this.db
      .select({
        invitationId: invitationBranches.invitationId,
        branchId: branches.id,
        branchName: branches.name,
      })
      .from(invitationBranches)
      .innerJoin(branches, eq(branches.id, invitationBranches.branchId))
      .where(eq(branches.organizationId, organizationId));

    return rows.map((invitation) => ({
      ...invitation,
      role: normalizeRole(invitation.role),
      branches: assignments.filter(
        (assignment) => assignment.invitationId === invitation.id,
      ),
    }));
  }

  async invite(
    context: SecurityContext,
    input: { email?: string; role?: string; branchIds?: string[] },
  ) {
    const email = input.email?.trim().toLowerCase();
    const role = normalizeRole(input.role);
    if (!email || !email.includes("@")) {
      throw new BadRequestException("A valid email is required");
    }
    if (!input.role || !ROLES.includes(input.role as AppRole) || role === "owner") {
      throw new BadRequestException("A valid non-owner role is required");
    }
    const branchIds = [...new Set(input.branchIds ?? [])];
    if (branchIds.length === 0 && !["admin"].includes(role)) {
      throw new BadRequestException("At least one branch is required");
    }
    if (branchIds.length > 0) {
      const validBranches = await this.db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.organizationId, context.organizationId),
            eq(branches.isActive, true),
            inArray(branches.id, branchIds),
          ),
        );
      if (validBranches.length !== branchIds.length) {
        throw new BadRequestException("One or more branches are invalid");
      }
    }

    const [existingMember] = await this.db
      .select({ id: members.id })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, context.organizationId),
          sql`lower(${users.email}) = ${email}`,
        ),
      )
      .limit(1);
    if (existingMember) {
      throw new ConflictException("This user is already an organization member");
    }

    const [existingInvitation] = await this.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, context.organizationId),
          sql`lower(${invitations.email}) = ${email}`,
          eq(invitations.status, "pending"),
        ),
      )
      .limit(1);
    if (existingInvitation) {
      throw new ConflictException(
        "A pending invitation already exists for this email",
      );
    }

    const [invitation] = await this.db
      .insert(invitations)
      .values({
        id: randomUUID(),
        organizationId: context.organizationId,
        email,
        role,
        inviterId: context.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
    if (branchIds.length) {
      await this.db.insert(invitationBranches).values(
        branchIds.map((branchId) => ({
          invitationId: invitation.id,
          branchId,
        })),
      );
    }

    const delivery = await this.sendInvitationEmail(
      context,
      invitation.id,
      email,
      role,
      branchIds,
    );

    return { ...invitation, branchIds, delivery };
  }

  async resendInvitation(context: SecurityContext, invitationId: string) {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, context.organizationId),
          eq(invitations.status, "pending"),
        ),
      )
      .limit(1);
    if (!invitation) {
      throw new NotFoundException("Pending invitation not found");
    }

    const branchRows = await this.db
      .select({ branchId: invitationBranches.branchId })
      .from(invitationBranches)
      .where(eq(invitationBranches.invitationId, invitation.id));
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db
      .update(invitations)
      .set({ expiresAt })
      .where(eq(invitations.id, invitation.id));

    const delivery = await this.sendInvitationEmail(
      context,
      invitation.id,
      invitation.email,
      normalizeRole(invitation.role),
      branchRows.map((branch) => branch.branchId),
    );

    return { ...invitation, expiresAt, delivery };
  }

  async cancelInvitation(context: SecurityContext, invitationId: string) {
    const [cancelled] = await this.db
      .update(invitations)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, context.organizationId),
        ),
      )
      .returning();
    if (!cancelled) throw new NotFoundException("Invitation not found");
    return cancelled;
  }

  private async sendInvitationEmail(
    context: SecurityContext,
    invitationId: string,
    recipientEmail: string,
    role: AppRole,
    branchIds: string[],
  ) {
    const [[organization], [inviter], branchRows] = await Promise.all([
      this.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, context.organizationId))
        .limit(1),
      this.db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1),
      branchIds.length
        ? this.db
            .select({ name: branches.name })
            .from(branches)
            .where(inArray(branches.id, branchIds))
            .orderBy(asc(branches.name))
        : Promise.resolve([]),
    ]);

    const organizationName = organization?.name ?? "your organization";
    const inviterName = inviter?.name ?? inviter?.email ?? "An administrator";
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    const inviteUrl = `${webUrl}/invite/${encodeURIComponent(invitationId)}?email=${encodeURIComponent(recipientEmail)}`;
    const roleLabel = role[0]!.toUpperCase() + role.slice(1);
    const branchLabel =
      role === "admin"
        ? "All branches"
        : branchRows.map((branch) => branch.name).join(", ") || "Assigned branches";
    const expiresText = "This invitation expires in 7 days.";
    const safeOrganizationName = escapeHtml(organizationName);
    const safeInviterName = escapeHtml(inviterName);
    const safeRoleLabel = escapeHtml(roleLabel);
    const safeBranchLabel = escapeHtml(branchLabel);

    try {
      return await this.mail.sendMail({
        to: recipientEmail,
        subject: `You’re invited to ${organizationName} on FrogmenDash`,
        text: [
          `${inviterName} invited you to join ${organizationName} on FrogmenDash.`,
          `Role: ${roleLabel}`,
          `Branch access: ${branchLabel}`,
          "",
          `Accept invitation: ${inviteUrl}`,
          expiresText,
        ].join("\n"),
        html: `
          <div style="background:#f4f7f5;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#17201c">
            <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dfe7e3;border-radius:16px;overflow:hidden">
              <div style="padding:28px 30px;background:linear-gradient(135deg,#047857,#10b981);color:#fff">
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85">FrogmenDash</div>
                <h1 style="margin:10px 0 0;font-size:25px;line-height:1.25">Join ${safeOrganizationName}</h1>
              </div>
              <div style="padding:30px">
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6">${safeInviterName} invited you to collaborate in their organization workspace.</p>
                <div style="padding:16px;border-radius:12px;background:#f3f8f5">
                  <p style="margin:0 0 8px"><strong>Role:</strong> ${safeRoleLabel}</p>
                  <p style="margin:0"><strong>Branch access:</strong> ${safeBranchLabel}</p>
                </div>
                <a href="${inviteUrl}" style="display:inline-block;margin:24px 0 18px;padding:12px 20px;border-radius:9px;background:#059669;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a>
                <p style="margin:0;color:#66736d;font-size:13px">${expiresText}</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      return {
        delivered: false,
        mode: "error" as const,
        error:
          error instanceof Error ? error.message : "Invitation email failed",
      };
    }
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}
