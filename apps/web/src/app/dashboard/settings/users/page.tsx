"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  cancelInvitation,
  inviteMember,
  listBranches,
  listInvitations,
  listMembers,
  provisionMember,
  resendInvitation,
  updateMember,
  type AppRole,
  type Branch,
  type OrganizationInvitation,
  type OrganizationMember,
  type ProvisionedMember,
} from "@/lib/security-api";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormLayout,
  InlineGrid,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  Building2,
  Check,
  Clock3,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const roleOptions: Array<{ label: string; value: AppRole }> = [
  { label: "Admin", value: "admin" },
  { label: "Manager", value: "manager" },
  { label: "Accountant", value: "accountant" },
  { label: "Staff", value: "staff" },
  { label: "Viewer", value: "viewer" },
];

const roleDetails: Record<
  Exclude<AppRole, "owner">,
  { title: string; description: string }
> = {
  admin: {
    title: "Organization administrator",
    description:
      "Full access to every current and future branch, settings, users, and operations.",
  },
  manager: {
    title: "Operational manager",
    description:
      "Manages assigned branches, approvals, stock adjustments, and shared master data.",
  },
  accountant: {
    title: "Finance specialist",
    description:
      "Handles invoices, payments, accounting, reporting, and audit access in assigned branches.",
  },
  staff: {
    title: "Operations staff",
    description:
      "Creates draft sales and purchasing work and manages customers in assigned branches.",
  },
  viewer: {
    title: "Read-only viewer",
    description:
      "Can view shared masters and assigned-branch operations without making changes.",
  },
};

function roleLabel(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function memberInitials(member: OrganizationMember) {
  return (
    member.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || member.email.charAt(0).toUpperCase()
  );
}

type InviteMode = "email" | "create";

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function UsersSettingsPage() {
  const { showError, showSuccess } = useToast();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(
    null,
  );
  const [pendingCancel, setPendingCancel] =
    useState<OrganizationInvitation | null>(null);
  const [inviteMode, setInviteMode] = useState<InviteMode>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [inviteBranches, setInviteBranches] = useState<string[]>([]);
  const [sendCredentialsEmail, setSendCredentialsEmail] = useState(true);
  const [provisionedMember, setProvisionedMember] =
    useState<ProvisionedMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memberRows, branchRows, invitationRows] = await Promise.all([
        listMembers(),
        listBranches(),
        listInvitations(),
      ]);
      const activeBranches = branchRows.filter((branch) => branch.isActive);

      setMembers(memberRows);
      setBranches(activeBranches);
      setInvitations(invitationRows);
      setInviteBranches((current) => {
        if (current.length > 0) return current;
        const defaultBranch =
          activeBranches.find((branch) => branch.isMain) ?? activeBranches[0];
        return defaultBranch ? [defaultBranch.id] : [];
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load users",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!inviteOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inviting) {
        setInviteOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inviteOpen, inviting]);

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === "pending"),
    [invitations],
  );
  const mainBranch = branches.find((branch) => branch.isMain) ?? branches[0];
  const selectedRole =
    role === "owner" ? roleDetails.staff : roleDetails[role];
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameValid = name.trim().length >= 2;
  const inviteValid =
    emailValid &&
    (role === "admin" || inviteBranches.length > 0) &&
    (inviteMode === "email" || nameValid);

  function resetInvite() {
    setInviteMode("email");
    setName("");
    setEmail("");
    setRole("staff");
    setInviteBranches(mainBranch ? [mainBranch.id] : []);
    setSendCredentialsEmail(true);
  }

  async function changeRole(
    member: OrganizationMember,
    nextRole: AppRole,
  ) {
    setUpdatingMemberId(member.id);
    try {
      const assignedBranchIds = member.branches.map(
        (branch) => branch.branchId,
      );
      await updateMember(member.id, {
        role: nextRole,
        ...(nextRole !== "admin" &&
        nextRole !== "owner" &&
        assignedBranchIds.length === 0 &&
        mainBranch
          ? { branchIds: [mainBranch.id], primaryBranchId: mainBranch.id }
          : {}),
      });
      await load();
      showSuccess(`${member.name}'s role was updated.`);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to update role",
      );
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function toggleMemberBranch(
    member: OrganizationMember,
    branchId: string,
    checked: boolean,
  ) {
    const current = member.branches.map((branch) => branch.branchId);
    const branchIds = checked
      ? [...new Set([...current, branchId])]
      : current.filter((id) => id !== branchId);

    setUpdatingMemberId(member.id);
    try {
      await updateMember(member.id, {
        branchIds,
        primaryBranchId:
          member.branches.find((branch) => branch.isPrimary)?.branchId ??
          branchIds[0],
      });
      await load();
      showSuccess("Branch access updated.");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Unable to update branch access",
      );
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function sendInvite() {
    if (!inviteValid) return;

    setInviting(true);
    try {
      if (inviteMode === "create") {
        const result = await provisionMember({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          branchIds: role === "admin" ? [] : inviteBranches,
          sendEmail: sendCredentialsEmail,
        });
        resetInvite();
        setInviteOpen(false);
        setProvisionedMember(result);
        await load();
        if (sendCredentialsEmail && result.delivery.delivered) {
          showSuccess(
            `${result.name} was created and sign-in details were emailed.`,
          );
        } else if (sendCredentialsEmail && result.delivery.mode === "log") {
          showSuccess(
            `${result.name} was created. Configure SMTP or Resend to email credentials.`,
          );
        } else if (sendCredentialsEmail) {
          showError(
            "User created, but the credentials email could not be delivered. Share the details manually.",
          );
        } else {
          showSuccess(`${result.name} can now sign in with the generated password.`);
        }
        return;
      }

      const result = await inviteMember({
        email: email.trim().toLowerCase(),
        role,
        branchIds: role === "admin" ? [] : inviteBranches,
      });
      resetInvite();
      setInviteOpen(false);
      await load();

      if (result.delivery.delivered) {
        showSuccess("Invitation email sent.");
      } else if (result.delivery.mode === "log") {
        showSuccess(
          "Invitation created. Configure SMTP or Resend to deliver emails.",
        );
      } else {
        showError(
          "Invitation created, but email delivery failed. Use Resend to try again.",
        );
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to invite user");
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(invitation: OrganizationInvitation) {
    setInvitationActionId(invitation.id);
    try {
      const result = await resendInvitation(invitation.id);
      await load();
      if (result.delivery.delivered) {
        showSuccess(`Invitation resent to ${invitation.email}.`);
      } else if (result.delivery.mode === "log") {
        showSuccess("Invitation refreshed and logged in development mode.");
      } else {
        showError("Invitation refreshed, but email delivery failed.");
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to resend invitation",
      );
    } finally {
      setInvitationActionId(null);
    }
  }

  async function handleCancelInvitation() {
    if (!pendingCancel) return;

    setInvitationActionId(pendingCancel.id);
    try {
      await cancelInvitation(pendingCancel.id);
      setPendingCancel(null);
      await load();
      showSuccess("Invitation cancelled.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to cancel invitation",
      );
    } finally {
      setInvitationActionId(null);
    }
  }

  return (
    <AppPage
      title="Users & roles"
      subtitle="Control organization access with secure fixed roles and branch assignments."
      primaryAction={{
        content: "Add user",
        onAction: () => setInviteOpen(true),
      }}
    >
      <BlockStack gap="500">
        <section className="users-settings__hero">
          <div className="users-settings__hero-copy">
            <div className="users-settings__hero-icon">
              <Users aria-hidden size={24} />
            </div>
            <div>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingLg">
                  Your team
                </Text>
                <Badge tone="success">Fixed RBAC</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Give every person only the permissions and branch access they
                need.
              </Text>
            </div>
          </div>
          <div className="users-settings__stats">
            <div>
              <span>{loading ? " " : members.length}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Members
              </Text>
            </div>
            <div>
              <span>{loading ? " " : pendingInvitations.length}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Pending
              </Text>
            </div>
            <div>
              <span>{loading ? " " : branches.length}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Branches
              </Text>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="users-settings__loading">
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="p" tone="subdued">
                Loading users and invitations…
              </Text>
            </InlineStack>
          </div>
        ) : loadError ? (
          <Card>
            <BlockStack gap="400">
              <Banner tone="critical" title="Users could not be loaded">
                <p>{loadError}</p>
              </Banner>
              <InlineStack align="end">
                <Button onClick={() => void load()}>Try again</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : (
          <>
            {pendingInvitations.length > 0 ? (
              <BlockStack gap="300">
                <div className="users-settings__section-title">
                  <div>
                    <Text as="h2" variant="headingMd">
                      Pending invitations
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Invitations expire seven days after they are sent.
                    </Text>
                  </div>
                  <Badge tone="attention">
                    {`${pendingInvitations.length} pending`}
                  </Badge>
                </div>
                <Card>
                  <BlockStack gap="300">
                    {pendingInvitations.map((invitation, index) => {
                      const expired =
                        new Date(invitation.expiresAt).getTime() < Date.now();
                      return (
                        <div
                          className="users-settings__invitation"
                          key={invitation.id}
                        >
                          <div className="users-settings__invitation-icon">
                            <Mail aria-hidden size={18} />
                          </div>
                          <div className="users-settings__invitation-copy">
                            <InlineStack gap="150" blockAlign="center" wrap>
                              <Text as="p" fontWeight="semibold">
                                {invitation.email}
                              </Text>
                              <Badge>{roleLabel(invitation.role)}</Badge>
                              {expired ? (
                                <Badge tone="critical">Expired</Badge>
                              ) : null}
                            </InlineStack>
                            <Text as="p" tone="subdued" variant="bodySm">
                              {invitation.role === "admin"
                                ? "All branches"
                                : invitation.branches
                                    .map((branch) => branch.branchName)
                                    .join(", ") || "No branch assignment"}
                              {" · "}Invited by {invitation.inviterName}
                            </Text>
                          </div>
                          <InlineStack gap="150">
                            <Button
                              loading={invitationActionId === invitation.id}
                              size="slim"
                              variant="plain"
                              onClick={() => void handleResend(invitation)}
                            >
                              {expired ? "Send new link" : "Resend"}
                            </Button>
                            <Button
                              disabled={invitationActionId === invitation.id}
                              size="slim"
                              tone="critical"
                              variant="plain"
                              onClick={() => setPendingCancel(invitation)}
                            >
                              Cancel
                            </Button>
                          </InlineStack>
                          {index < pendingInvitations.length - 1 ? (
                            <div className="users-settings__invitation-divider" />
                          ) : null}
                        </div>
                      );
                    })}
                  </BlockStack>
                </Card>
              </BlockStack>
            ) : null}

            <BlockStack gap="300">
              <div className="users-settings__section-title">
                <div>
                  <Text as="h2" variant="headingMd">
                    Organization members
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Update roles and branch access. Changes apply immediately.
                  </Text>
                </div>
                <Badge>{`${members.length} total`}</Badge>
              </div>

              {members.length === 0 ? (
                <Card>
                  <EmptyState
                    action={{
                      content: "Invite user",
                      onAction: () => setInviteOpen(true),
                    }}
                    heading="Build your team"
                    image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                  >
                    <p>Invite colleagues and assign secure branch access.</p>
                  </EmptyState>
                </Card>
              ) : (
                <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
                  {members.map((member) => {
                    const globalAccess =
                      member.role === "owner" || member.role === "admin";
                    const assignedBranchIds = member.branches.map(
                      (branch) => branch.branchId,
                    );
                    return (
                      <Card key={member.id}>
                        <BlockStack gap="400">
                          <div className="users-settings__member-header">
                            <div className="users-settings__member-identity">
                              <div className="users-settings__avatar">
                                {memberInitials(member)}
                              </div>
                              <div>
                                <InlineStack
                                  gap="150"
                                  blockAlign="center"
                                  wrap
                                >
                                  <Text as="h3" variant="headingMd">
                                    {member.name}
                                  </Text>
                                  {member.role === "owner" ? (
                                    <Badge tone="info">Owner</Badge>
                                  ) : null}
                                </InlineStack>
                                <Text as="p" tone="subdued" variant="bodySm">
                                  {member.email}
                                </Text>
                              </div>
                            </div>
                            {updatingMemberId === member.id ? (
                              <Spinner size="small" />
                            ) : (
                              <Badge tone="success">Active</Badge>
                            )}
                          </div>

                          <div className="users-settings__member-role">
                            <UserRoundCog aria-hidden size={18} />
                            <div>
                              <Text as="p" tone="subdued" variant="bodySm">
                                Role
                              </Text>
                              {member.role === "owner" ? (
                                <Text as="p" fontWeight="semibold">
                                  Organization owner
                                </Text>
                              ) : (
                                <Select
                                  disabled={updatingMemberId === member.id}
                                  label="Role"
                                  labelHidden
                                  options={roleOptions}
                                  value={member.role}
                                  onChange={(value) =>
                                    void changeRole(
                                      member,
                                      value as AppRole,
                                    )
                                  }
                                />
                              )}
                            </div>
                          </div>

                          <div className="users-settings__access">
                            <div className="users-settings__access-heading">
                              <Building2 aria-hidden size={18} />
                              <div>
                                <Text as="p" fontWeight="semibold">
                                  Branch access
                                </Text>
                                <Text as="p" tone="subdued" variant="bodySm">
                                  {globalAccess
                                    ? "Automatically includes every current and future branch."
                                    : "Select one or more locations for this user."}
                                </Text>
                              </div>
                            </div>
                            {globalAccess ? (
                              <div className="users-settings__all-access">
                                <ShieldCheck aria-hidden size={17} />
                                <Text as="p" variant="bodySm">
                                  All branches
                                </Text>
                              </div>
                            ) : (
                              <div className="users-settings__branch-grid">
                                {branches.map((branch) => {
                                  const checked =
                                    assignedBranchIds.includes(branch.id);
                                  return (
                                    <div
                                      className={`users-settings__branch-option${
                                        checked ? " is-selected" : ""
                                      }`}
                                      key={branch.id}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={
                                          updatingMemberId === member.id ||
                                          (checked &&
                                            assignedBranchIds.length === 1)
                                        }
                                        label={branch.name}
                                        onChange={(nextChecked) =>
                                          void toggleMemberBranch(
                                            member,
                                            branch.id,
                                            nextChecked,
                                          )
                                        }
                                      />
                                      {member.branches.some(
                                        (assigned) =>
                                          assigned.branchId === branch.id &&
                                          assigned.isPrimary,
                                      ) ? (
                                        <Badge tone="info">Primary</Badge>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </BlockStack>
                      </Card>
                    );
                  })}
                </InlineGrid>
              )}
            </BlockStack>
          </>
        )}

        <div className="users-settings__notice">
          <ShieldCheck aria-hidden size={19} />
          <div>
            <Text as="p" fontWeight="semibold">
              API enforcement remains the security boundary
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Navigation is tailored for usability, while permissions and
              PostgreSQL row security enforce access on every request.
            </Text>
          </div>
        </div>
      </BlockStack>

      {inviteOpen ? (
        <div className="user-invite-panel">
          <div
            aria-hidden
            className="user-invite-panel__overlay"
            onClick={() => {
              if (!inviting) setInviteOpen(false);
            }}
          />
          <aside
            aria-labelledby="user-invite-panel-title"
            aria-modal="true"
            className="user-invite-panel__drawer"
            role="dialog"
          >
            <header className="user-invite-panel__header">
              <div>
                <Text as="h2" id="user-invite-panel-title" variant="headingLg">
                  Add user
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Send an email invite or create an account with a temporary password.
                </Text>
              </div>
              <Button
                disabled={inviting}
                variant="tertiary"
                onClick={() => setInviteOpen(false)}
              >
                Close
              </Button>
            </header>

            <div className="user-invite-panel__body">
              <div className="user-invite-panel__mode-toggle">
                <Button
                  pressed={inviteMode === "email"}
                  onClick={() => setInviteMode("email")}
                >
                  Email invite
                </Button>
                <Button
                  pressed={inviteMode === "create"}
                  onClick={() => setInviteMode("create")}
                >
                  Create with password
                </Button>
              </div>

              <div className="user-invite-panel__intro">
                <div className="users-settings__section-icon">
                  <UserPlus aria-hidden size={19} />
                </div>
                <div>
                  <Text as="h3" variant="headingMd">
                    {inviteMode === "email"
                      ? "Invitation details"
                      : "Account details"}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {inviteMode === "email"
                      ? "The recipient receives a seven-day acceptance link by email."
                      : "Generate a temporary password, share it securely, and require a new password on first sign-in."}
                  </Text>
                </div>
              </div>

              <FormLayout>
                {inviteMode === "create" ? (
                  <TextField
                    autoComplete="name"
                    error={
                      name.length > 0 && !nameValid
                        ? "Enter the user's full name"
                        : undefined
                    }
                    label="Full name"
                    placeholder="name"
                    value={name}
                    onChange={setName}
                  />
                ) : null}
                <TextField
                  autoComplete="email"
                  error={
                    email.length > 3 && !emailValid
                      ? "Enter a valid email address"
                      : undefined
                  }
                  label="Email address"
                  placeholder="colleague@company.com"
                  type="email"
                  value={email}
                  onChange={setEmail}
                />
                <Select
                  label="Role"
                  options={roleOptions}
                  value={role}
                  onChange={(value) => setRole(value as AppRole)}
                />
                {inviteMode === "create" ? (
                  <Checkbox
                    checked={sendCredentialsEmail}
                    helpText="Sends the temporary password and sign-in link to the user's email."
                    label="Email sign-in details to the user"
                    onChange={setSendCredentialsEmail}
                  />
                ) : null}
              </FormLayout>

              <div className="user-invite-panel__role-card">
                <UserRoundCog aria-hidden size={18} />
                <div>
                  <Text as="p" fontWeight="semibold">
                    {selectedRole.title}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {selectedRole.description}
                  </Text>
                </div>
              </div>

              <div>
                <Text as="h3" variant="headingSm">
                  Branch access
                </Text>
                <div className="user-invite-panel__branch-list">
                  {role === "admin" ? (
                    <div className="user-invite-panel__all-branches">
                      <ShieldCheck aria-hidden size={18} />
                      <div>
                        <Text as="p" fontWeight="semibold">
                          All branches
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Admins automatically access every current and future
                          branch.
                        </Text>
                      </div>
                    </div>
                  ) : (
                    branches.map((branch) => {
                      const checked = inviteBranches.includes(branch.id);
                      return (
                        <div
                          className={`user-invite-panel__branch${
                            checked ? " is-selected" : ""
                          }`}
                          key={branch.id}
                        >
                          <Checkbox
                            checked={checked}
                            label={branch.name}
                            onChange={(nextChecked) =>
                              setInviteBranches((current) =>
                                nextChecked
                                  ? [...new Set([...current, branch.id])]
                                  : current.filter((id) => id !== branch.id),
                              )
                            }
                          />
                          <div className="user-invite-panel__branch-meta">
                            {branch.isMain ? (
                              <Badge tone="info">Main</Badge>
                            ) : null}
                            {checked ? (
                              <Check aria-hidden size={16} />
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <Banner tone="info">
                <p>
                  {inviteMode === "email"
                    ? "The invite can be resent or cancelled from Pending invitations."
                    : sendCredentialsEmail
                      ? "The temporary password is emailed to the user and shown here once for your records."
                      : "Copy the generated password immediately. It is shown only once and the user must replace it on first sign-in."}
                </p>
              </Banner>
            </div>

            <footer className="user-invite-panel__footer">
              <Button
                disabled={inviting}
                onClick={() => {
                  resetInvite();
                  setInviteOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!inviteValid}
                loading={inviting}
                variant="primary"
                onClick={sendInvite}
              >
                {inviteMode === "email"
                  ? "Send invitation"
                  : "Create user"}
              </Button>
            </footer>
          </aside>
        </div>
      ) : null}

      <Modal
        open={Boolean(provisionedMember)}
        title="User created"
        onClose={() => setProvisionedMember(null)}
        primaryAction={{
          content: "Done",
          onAction: () => setProvisionedMember(null),
        }}
      >
        <Modal.Section>
          {provisionedMember ? (
            <BlockStack gap="400">
              <Banner
                tone={
                  provisionedMember.delivery.delivered
                    ? "success"
                    : provisionedMember.delivery.mode === "error"
                      ? "warning"
                      : "info"
                }
              >
                <p>
                  {provisionedMember.delivery.delivered
                    ? `Sign-in details were emailed to ${provisionedMember.email}. The temporary password is also shown below in case you need to share it another way.`
                    : provisionedMember.delivery.mode === "skipped"
                      ? `Share these sign-in details with ${provisionedMember.name}. They will be asked to set a new password on first sign-in.`
                      : "The user was created, but the credentials email was not delivered. Share the details below manually."}
                </p>
              </Banner>
              <div className="users-settings__provision-field">
                <Text as="p" tone="subdued" variant="bodySm">
                  Email
                </Text>
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="p" fontWeight="semibold">
                    {provisionedMember.email}
                  </Text>
                  <Button
                    size="slim"
                    onClick={() => void copyText(provisionedMember.email).then(() =>
                      showSuccess("Email copied."),
                    )}
                  >
                    Copy
                  </Button>
                </InlineStack>
              </div>
              <div className="users-settings__provision-field">
                <Text as="p" tone="subdued" variant="bodySm">
                  Temporary password
                </Text>
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="p" fontWeight="semibold">
                    {provisionedMember.temporaryPassword}
                  </Text>
                  <Button
                    size="slim"
                    onClick={() =>
                      void copyText(provisionedMember.temporaryPassword).then(
                        () => showSuccess("Password copied."),
                      )
                    }
                  >
                    Copy
                  </Button>
                </InlineStack>
              </div>
              <div className="users-settings__provision-field">
                <Text as="p" tone="subdued" variant="bodySm">
                  Sign-in link
                </Text>
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="p" fontWeight="semibold">
                    {provisionedMember.loginUrl}
                  </Text>
                  <Button
                    size="slim"
                    onClick={() =>
                      void copyText(provisionedMember.loginUrl).then(() =>
                        showSuccess("Sign-in link copied."),
                      )
                    }
                  >
                    Copy
                  </Button>
                </InlineStack>
              </div>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(pendingCancel)}
        title="Cancel invitation?"
        onClose={() => setPendingCancel(null)}
        primaryAction={{
          content: "Cancel invitation",
          destructive: true,
          loading: invitationActionId === pendingCancel?.id,
          onAction: handleCancelInvitation,
        }}
        secondaryActions={[
          {
            content: "Keep invitation",
            onAction: () => setPendingCancel(null),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              {pendingCancel?.email} will no longer be able to use the invitation
              link.
            </Text>
            <div className="users-settings__expiry-note">
              <Clock3 aria-hidden size={17} />
              <Text as="p" tone="subdued" variant="bodySm">
                You can create a fresh invitation later.
              </Text>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
