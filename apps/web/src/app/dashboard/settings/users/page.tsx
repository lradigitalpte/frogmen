"use client";

import {
  ActionList,
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Checkbox,
  Icon,
  Modal,
  Popover,
  RadioButton,
  Select,
  SkeletonBodyText,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckIcon,
  DeleteIcon,
  EmailIcon,
  MenuHorizontalIcon,
  MinusIcon,
  PersonAddIcon,
  SearchIcon,
  StoreIcon,
} from "@shopify/polaris-icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { PERMISSION_GROUPS, ROLE_INFO, roleLabel } from "@/lib/access";
import { useSession } from "@/lib/auth-client";
import { copyText } from "@/lib/clipboard";
import {
  cancelInvitation,
  inviteMember,
  listBranches,
  listInvitations,
  listMembers,
  listRolePermissions,
  provisionMember,
  removeMember,
  resendInvitation,
  updateMember,
  type AppRole,
  type Branch,
  type OrganizationInvitation,
  type OrganizationMember,
  type ProvisionedMember,
} from "@/lib/security-api";
import { cn } from "@/lib/utils";

type TabId = "people" | "roles" | "invites";
const TAB_IDS: TabId[] = ["people", "roles", "invites"];
const ASSIGNABLE: AppRole[] = ["admin", "manager", "accountant", "staff", "viewer"];
const ROLE_ORDER: AppRole[] = ["owner", "admin", "manager", "accountant", "staff", "viewer"];

function initials(name: string, email: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || email.charAt(0).toUpperCase()
  );
}

const roleOptions = ASSIGNABLE.map((r) => ({ label: roleLabel(r), value: r }));
const isGlobal = (role: AppRole) => role === "owner" || role === "admin";

function UsersInner() {
  const { showError, showSuccess } = useToast();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : "people";

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [accessFor, setAccessFor] = useState<OrganizationMember | null>(null);
  const [accessBranches, setAccessBranches] = useState<string[]>([]);
  const [accessPrimary, setAccessPrimary] = useState<string>("");
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const [pendingCancel, setPendingCancel] = useState<OrganizationInvitation | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"email" | "create">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [inviteBranches, setInviteBranches] = useState<string[]>([]);
  const [sendCredentials, setSendCredentials] = useState(true);
  const [adding, setAdding] = useState(false);
  const [touched, setTouched] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisionedMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memberRows, branchRows, invitationRows, roles] = await Promise.all([
        listMembers(),
        listBranches(),
        listInvitations(),
        listRolePermissions().catch(() => []),
      ]);
      const active = branchRows.filter((b) => b.isActive);
      setMembers(memberRows);
      setBranches(active);
      setInvitations(invitationRows);
      setRolePerms(Object.fromEntries(roles.map((r) => [r.role, r.permissions])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goTab = (id: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const mainBranch = branches.find((b) => b.isMain) ?? branches[0];
  const pending = useMemo(() => invitations.filter((i) => i.status === "pending"), [invitations]);
  const byRole = useMemo(() => {
    const m = new Map<AppRole, number>();
    for (const x of members) m.set(x.role, (m.get(x.role) ?? 0) + 1);
    return m;
  }, [members]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? members.filter((m) => `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q)) : members;
    return [...list].sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name),
    );
  }, [members, query]);

  // ── Member actions ──
  async function changeRole(member: OrganizationMember, nextRole: AppRole) {
    if (nextRole === member.role) return;
    setBusyId(member.id);
    try {
      const assigned = member.branches.map((b) => b.branchId);
      await updateMember(member.id, {
        role: nextRole,
        // Non-admin roles only see assigned branches — give them the main branch if they had none.
        ...(!isGlobal(nextRole) && assigned.length === 0 && mainBranch
          ? { branchIds: [mainBranch.id], primaryBranchId: mainBranch.id }
          : {}),
      });
      await load();
      showSuccess(`${member.name} is now ${roleLabel(nextRole).toLowerCase() === "admin" ? "an" : "a"} ${roleLabel(nextRole)}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't change the role");
    } finally {
      setBusyId(null);
    }
  }

  function openAccess(member: OrganizationMember) {
    setAccessFor(member);
    setAccessBranches(member.branches.map((b) => b.branchId));
    setAccessPrimary(member.branches.find((b) => b.isPrimary)?.branchId ?? member.branches[0]?.branchId ?? "");
  }

  async function saveAccess() {
    if (!accessFor || !accessBranches.length) return;
    setBusyId(accessFor.id);
    try {
      const primary = accessBranches.includes(accessPrimary) ? accessPrimary : accessBranches[0];
      await updateMember(accessFor.id, { branchIds: accessBranches, primaryBranchId: primary });
      showSuccess(`Branch access updated for ${accessFor.name}`);
      setAccessFor(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't update branch access");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusyId(removing.id);
    try {
      await removeMember(removing.id);
      showSuccess(`${removing.name} was removed and signed out`);
      setRemoving(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't remove this person");
    } finally {
      setBusyId(null);
    }
  }

  // ── Invitations ──
  async function resend(invitation: OrganizationInvitation) {
    setBusyId(invitation.id);
    try {
      const result = await resendInvitation(invitation.id);
      await load();
      if (result.delivery.delivered) showSuccess(`Invitation resent to ${invitation.email}`);
      else if (result.delivery.mode === "log") showSuccess("Invitation refreshed (email isn't set up, so it was only logged)");
      else showError("Invitation refreshed, but the email couldn't be delivered");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't resend the invitation");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    setBusyId(pendingCancel.id);
    try {
      await cancelInvitation(pendingCancel.id);
      showSuccess("Invitation cancelled");
      setPendingCancel(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't cancel the invitation");
    } finally {
      setBusyId(null);
    }
  }

  // ── Add user ──
  function openAdd() {
    setMode("email");
    setName("");
    setEmail("");
    setRole("staff");
    setInviteBranches(mainBranch ? [mainBranch.id] : []);
    setSendCredentials(true);
    setTouched(false);
    setAddOpen(true);
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameValid = name.trim().length >= 2;
  const alreadyMember = members.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());
  const alreadyInvited = pending.some((i) => i.email.toLowerCase() === email.trim().toLowerCase());
  const addErrors = {
    name: mode === "create" && !nameValid ? "Enter their full name" : undefined,
    email: !emailValid
      ? "Enter a valid email address"
      : alreadyMember
        ? "This person is already in your team"
        : alreadyInvited
          ? "There's already a pending invitation for this email"
          : undefined,
    branches: !isGlobal(role) && inviteBranches.length === 0 ? "Choose at least one branch" : undefined,
  };
  const addValid = !addErrors.name && !addErrors.email && !addErrors.branches;

  async function submitAdd() {
    setTouched(true);
    if (!addValid || adding) return;
    setAdding(true);
    try {
      const branchIds = isGlobal(role) ? [] : inviteBranches;
      if (mode === "create") {
        const result = await provisionMember({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          branchIds,
          sendEmail: sendCredentials,
        });
        setAddOpen(false);
        setProvisioned(result);
        await load();
        if (sendCredentials && !result.delivery.delivered && result.delivery.mode !== "log") {
          showError("Account created, but the email couldn't be delivered — share the details below");
        } else {
          showSuccess(`${result.name} can now sign in`);
        }
      } else {
        const result = await inviteMember({ email: email.trim().toLowerCase(), role, branchIds });
        setAddOpen(false);
        await load();
        if (result.delivery.delivered) showSuccess("Invitation sent");
        else if (result.delivery.mode === "log") showSuccess("Invitation created (email isn't set up, so it was only logged)");
        else showError("Invitation created, but the email couldn't be delivered — use Resend");
        goTab("invites");
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't add this person");
    } finally {
      setAdding(false);
    }
  }

  const tabs = [
    { id: "people", content: "People", badge: String(members.length), panelID: "users-people" },
    { id: "roles", content: "What each role can do", panelID: "users-roles" },
    { id: "invites", content: "Invitations", badge: pending.length ? String(pending.length) : undefined, panelID: "users-invites" },
  ];

  const rolePermList = rolePerms[role] ?? [];

  return (
    <AppPage
      fullWidth
      title="Users & roles"
      subtitle="Who can sign in, what their role lets them do, and which branches they see."
      primaryAction={{ content: "Add user", onAction: openAdd }}
    >
      <div className="usr">
        {loadError ? (
          <div className="ac-error">
            <span>{loadError}</span>
            <button className="st-link" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        {/* ── Summary ── */}
        <section className={cn("pl-hero usr-hero", loading && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Your team</span>
            <span className="pl-hero__value">{loading ? "—" : members.length}</span>
            <span className="pl-hero__period">
              {members.length === 1 ? "person" : "people"} with access
              {pending.length ? ` · ${pending.length} invited` : ""}
            </span>
          </div>
          <div className="usr-hero__roles">
            {ROLE_ORDER.map((r) => (
              <div key={r} className={cn("usr-hero__role", !byRole.get(r) && "is-empty")}>
                <strong>{byRole.get(r) ?? 0}</strong>
                <span>{roleLabel(r)}</span>
              </div>
            ))}
          </div>
          <p className="brs-hero__rule">
            <b>Owners and admins</b> see every branch. <b>Everyone else</b> only sees the branches you assign them,
            and the API checks their role on every request.
          </p>
        </section>

        <section className="ex-surface cpf-tabs">
          <Tabs tabs={tabs} selected={TAB_IDS.indexOf(tab)} onSelect={(i) => goTab(TAB_IDS[i])} />
        </section>

        {/* ── People ── */}
        {tab === "people" ? (
          <section className="ex-surface">
            <div className="st-toolbar">
              <div className="st-toolbar__controls usr-toolbar">
              <div className="st-toolbar__search">
                <TextField
                  label="Search people"
                  labelHidden
                  autoComplete="off"
                  placeholder="Search name, email or role…"
                  prefix={<Icon source={SearchIcon} tone="subdued" />}
                  value={query}
                  onChange={setQuery}
                  clearButton
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              </div>
            </div>
            {loading && !members.length ? (
              <div className="ex-pad">
                <SkeletonBodyText lines={4} />
              </div>
            ) : !visible.length ? (
              <div className="ex-empty">
                <Text as="h3" variant="headingSm">
                  {members.length ? "Nobody matches" : "No one here yet"}
                </Text>
                <p>{members.length ? "Try another search." : "Add your colleagues and choose what they can do."}</p>
              </div>
            ) : (
              <ul className={cn("ex-list", loading && "st-dim")}>
                {visible.map((member) => {
                  const me = member.userId === myUserId;
                  const locked = member.role === "owner" || me;
                  const busy = busyId === member.id;
                  return (
                    <li key={member.id} className="usr-row">
                      <span className={cn("usr-avatar", `is-${member.role}`)}>{initials(member.name, member.email)}</span>
                      <span className="usr-who">
                        <strong>
                          {member.name || member.email}
                          {me ? <Badge size="small">You</Badge> : null}
                        </strong>
                        <small>{member.email}</small>
                      </span>
                      <span className="usr-role">
                        {locked ? (
                          <span className="usr-role__fixed">
                            <b>{roleLabel(member.role)}</b>
                            <small>{member.role === "owner" ? "Can't be changed" : "Your own role"}</small>
                          </span>
                        ) : (
                          <>
                            <Select
                              label={`Role for ${member.name}`}
                              labelHidden
                              options={roleOptions}
                              value={member.role}
                              disabled={busy}
                              onChange={(v) => void changeRole(member, v as AppRole)}
                            />
                            <small>{ROLE_INFO[member.role]?.summary}</small>
                          </>
                        )}
                      </span>
                      <span className="usr-branches">
                        {isGlobal(member.role) ? (
                          <span className="usr-chip is-all">
                            <Icon source={StoreIcon} /> All branches
                          </span>
                        ) : member.branches.length ? (
                          member.branches.map((b) => (
                            <span key={b.branchId} className={cn("usr-chip", b.isPrimary && "is-primary")}>
                              {b.branchName}
                              {b.isPrimary && member.branches.length > 1 ? <em>primary</em> : null}
                            </span>
                          ))
                        ) : (
                          <span className="usr-chip is-warn">No branch — can&apos;t sign in</span>
                        )}
                      </span>
                      <span className="usr-actions">
                        {!isGlobal(member.role) && !locked ? (
                          <Button size="slim" disabled={busy} onClick={() => openAccess(member)}>
                            Branches
                          </Button>
                        ) : null}
                        {!locked ? (
                          <Popover
                            active={menuFor === member.id}
                            activator={
                              <Button
                                accessibilityLabel={`More actions for ${member.name}`}
                                icon={MenuHorizontalIcon}
                                size="slim"
                                variant="tertiary"
                                loading={busy}
                                onClick={() => setMenuFor((v) => (v === member.id ? null : member.id))}
                              />
                            }
                            preferredAlignment="right"
                            onClose={() => setMenuFor(null)}
                          >
                            <ActionList
                              actionRole="menuitem"
                              onActionAnyItem={() => setMenuFor(null)}
                              items={[
                                {
                                  content: "Remove from team",
                                  icon: DeleteIcon,
                                  destructive: true,
                                  onAction: () => setRemoving(member),
                                },
                              ]}
                            />
                          </Popover>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* ── Role matrix ── */}
        {tab === "roles" ? (
          <section className="ex-surface usr-matrix-wrap">
            <div className="usr-matrix-scroll">
              <table className="usr-matrix">
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    {ROLE_ORDER.map((r) => (
                      <th scope="col" key={r}>
                        <b>{roleLabel(r)}</b>
                        <small>{byRole.get(r) ?? 0} {(byRole.get(r) ?? 0) === 1 ? "person" : "people"}</small>
                      </th>
                    ))}
                  </tr>
                  <tr className="usr-matrix__summary">
                    <td />
                    {ROLE_ORDER.map((r) => (
                      <td key={r}>{ROLE_INFO[r]?.summary}</td>
                    ))}
                  </tr>
                </thead>
                {PERMISSION_GROUPS.map((group) => (
                  <tbody key={group.title}>
                    <tr className="usr-matrix__group">
                      <th scope="rowgroup" colSpan={ROLE_ORDER.length + 1}>
                        {group.title}
                      </th>
                    </tr>
                    {group.items.map(([perm, label]) => (
                      <tr key={perm}>
                        <th scope="row">{label}</th>
                        {ROLE_ORDER.map((r) => {
                          const has = (rolePerms[r] ?? []).includes(perm);
                          return (
                            <td key={r} className={cn(has ? "is-yes" : "is-no")} aria-label={has ? "Yes" : "No"}>
                              <Icon source={has ? CheckIcon : MinusIcon} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="pl-foot usr-matrix__foot">
              Roles are fixed so access stays predictable. Everyone except Viewers can also add calendar events.
            </p>
          </section>
        ) : null}

        {/* ── Invitations ── */}
        {tab === "invites" ? (
          <section className="ex-surface">
            {!pending.length ? (
              <div className="ex-empty">
                <span className="ex-empty__icon">
                  <Icon source={EmailIcon} />
                </span>
                <Text as="h3" variant="headingSm">
                  No pending invitations
                </Text>
                <p>Invite someone by email and they&apos;ll appear here until they accept.</p>
                <Button onClick={openAdd}>Invite someone</Button>
              </div>
            ) : (
              <ul className="ex-list">
                {pending.map((invitation) => {
                  const expired = new Date(invitation.expiresAt).getTime() < Date.now();
                  return (
                    <li key={invitation.id} className="usr-row usr-row--invite">
                      <span className="usr-avatar is-invite">
                        <Icon source={EmailIcon} />
                      </span>
                      <span className="usr-who">
                        <strong>{invitation.email}</strong>
                        <small>
                          Invited by {invitation.inviterName} ·{" "}
                          {expired ? "expired" : `expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                        </small>
                      </span>
                      <span className="usr-role">
                        <Badge>{roleLabel(invitation.role)}</Badge>
                      </span>
                      <span className="usr-branches">
                        {isGlobal(invitation.role) ? (
                          <span className="usr-chip is-all">All branches</span>
                        ) : (
                          invitation.branches.map((b) => (
                            <span key={b.branchId} className="usr-chip">
                              {b.branchName}
                            </span>
                          ))
                        )}
                        {expired ? <Badge tone="critical">Expired</Badge> : null}
                      </span>
                      <span className="usr-actions">
                        <Button size="slim" loading={busyId === invitation.id} onClick={() => void resend(invitation)}>
                          {expired ? "Send new link" : "Resend"}
                        </Button>
                        <Button
                          size="slim"
                          variant="tertiary"
                          tone="critical"
                          disabled={busyId === invitation.id}
                          onClick={() => setPendingCancel(invitation)}
                        >
                          Cancel
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      {/* ── Add user ── */}
      <Modal
        open={addOpen}
        onClose={() => (adding ? undefined : setAddOpen(false))}
        title="Add someone to your team"
        size="large"
        primaryAction={{
          content: mode === "email" ? "Send invitation" : "Create account",
          loading: adding,
          onAction: () => void submitAdd(),
        }}
        secondaryActions={[{ content: "Cancel", disabled: adding, onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <div className="usr-add">
            <div className="usr-add__main">
              <ButtonGroup variant="segmented">
                <Button pressed={mode === "email"} onClick={() => setMode("email")} icon={EmailIcon}>
                  Email invitation
                </Button>
                <Button pressed={mode === "create"} onClick={() => setMode("create")} icon={PersonAddIcon}>
                  Create with password
                </Button>
              </ButtonGroup>
              <p className="usr-add__hint">
                {mode === "email"
                  ? "They get a link to set up their account. It works for 7 days."
                  : "You get a temporary password to share. They must change it the first time they sign in."}
              </p>

              {mode === "create" ? (
                <TextField
                  autoComplete="name"
                  label="Full name"
                  value={name}
                  onChange={setName}
                  error={touched ? addErrors.name : undefined}
                />
              ) : null}
              <TextField
                autoComplete="email"
                label="Email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={setEmail}
                error={touched || alreadyMember || alreadyInvited ? addErrors.email : undefined}
              />
              <Select label="Role" options={roleOptions} value={role} onChange={(v) => setRole(v as AppRole)} />

              <div className="usr-add__branches">
                <Text as="span" variant="bodyMd" fontWeight="medium">
                  Branches
                </Text>
                {isGlobal(role) ? (
                  <p className="usr-add__hint">Admins see every branch, including ones you add later.</p>
                ) : (
                  <>
                    <div className="usr-add__branch-list">
                      {branches.map((b) => (
                        <Checkbox
                          key={b.id}
                          label={`${b.name}${b.isMain ? " (main)" : ""}`}
                          checked={inviteBranches.includes(b.id)}
                          onChange={(checked) =>
                            setInviteBranches((cur) => (checked ? [...new Set([...cur, b.id])] : cur.filter((id) => id !== b.id)))
                          }
                        />
                      ))}
                    </div>
                    {touched && addErrors.branches ? <p className="usr-add__error">{addErrors.branches}</p> : null}
                  </>
                )}
              </div>

              {mode === "create" ? (
                <Checkbox
                  label="Email the sign-in details to them"
                  helpText="The password is also shown to you once, after you create the account."
                  checked={sendCredentials}
                  onChange={setSendCredentials}
                />
              ) : null}
            </div>

            <aside className="usr-add__side">
              <span className="brs-form__label">{roleLabel(role)} can</span>
              <p className="usr-add__summary">{ROLE_INFO[role]?.summary}</p>
              <ul className="usr-add__perms">
                {PERMISSION_GROUPS.flatMap((g) => g.items)
                  .filter(([p]) => rolePermList.includes(p))
                  .slice(0, 12)
                  .map(([p, label]) => (
                    <li key={p}>
                      <Icon source={CheckIcon} tone="success" />
                      {label}
                    </li>
                  ))}
              </ul>
              <Button variant="plain" onClick={() => { setAddOpen(false); goTab("roles"); }}>
                Compare all roles
              </Button>
            </aside>
          </div>
        </Modal.Section>
      </Modal>

      {/* ── Branch access ── */}
      <Modal
        open={Boolean(accessFor)}
        onClose={() => setAccessFor(null)}
        title={`Branches for ${accessFor?.name ?? ""}`}
        primaryAction={{
          content: "Save",
          loading: busyId === accessFor?.id,
          disabled: !accessBranches.length,
          onAction: () => void saveAccess(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAccessFor(null) }]}
      >
        <Modal.Section>
          <div className="usr-access">
            <p className="usr-add__hint">
              {roleLabel(accessFor?.role)}s only see records from these branches. The primary branch opens by default
              when they sign in.
            </p>
            {branches.map((b) => {
              const checked = accessBranches.includes(b.id);
              return (
                <div key={b.id} className={cn("usr-access__row", checked && "is-on")}>
                  <Checkbox
                    label={`${b.name} · ${b.code}`}
                    checked={checked}
                    onChange={(on) =>
                      setAccessBranches((cur) => (on ? [...new Set([...cur, b.id])] : cur.filter((id) => id !== b.id)))
                    }
                  />
                  {checked && accessBranches.length > 1 ? (
                    <RadioButton
                      label="Primary"
                      name="primary-branch"
                      checked={accessPrimary === b.id}
                      onChange={() => setAccessPrimary(b.id)}
                    />
                  ) : null}
                </div>
              );
            })}
            {!accessBranches.length ? <p className="usr-add__error">Choose at least one branch.</p> : null}
          </div>
        </Modal.Section>
      </Modal>

      {/* ── Remove ── */}
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? "this person"}?`}
        primaryAction={{
          content: "Remove",
          destructive: true,
          loading: busyId === removing?.id,
          onAction: () => void confirmRemove(),
        }}
        secondaryActions={[{ content: "Keep", onAction: () => setRemoving(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {removing?.name} will be signed out straight away and won&apos;t be able to open this organization. Their
            quotations, invoices and other records stay as they are. You can invite them again later.
          </Text>
        </Modal.Section>
      </Modal>

      {/* ── Cancel invitation ── */}
      <Modal
        open={Boolean(pendingCancel)}
        onClose={() => setPendingCancel(null)}
        title="Cancel this invitation?"
        primaryAction={{
          content: "Cancel invitation",
          destructive: true,
          loading: busyId === pendingCancel?.id,
          onAction: () => void confirmCancel(),
        }}
        secondaryActions={[{ content: "Keep it", onAction: () => setPendingCancel(null) }]}
      >
        <Modal.Section>
          <Text as="p">The link sent to {pendingCancel?.email} will stop working. You can invite them again later.</Text>
        </Modal.Section>
      </Modal>

      {/* ── Credentials (shown once) ── */}
      <Modal
        open={Boolean(provisioned)}
        onClose={() => setProvisioned(null)}
        title={`${provisioned?.name ?? "Account"} is ready`}
        primaryAction={{ content: "Done", onAction: () => setProvisioned(null) }}
      >
        <Modal.Section>
          {provisioned ? (
            <div className="usr-creds">
              <Banner tone={provisioned.delivery.delivered ? "success" : "warning"}>
                {provisioned.delivery.delivered
                  ? `We emailed these details to ${provisioned.email}. They're shown here once in case you need them.`
                  : "Share these details with them securely. This is the only time the password is shown."}
              </Banner>
              {[
                ["Email", provisioned.email],
                ["Temporary password", provisioned.temporaryPassword],
                ["Sign-in link", provisioned.loginUrl],
              ].map(([label, value]) => (
                <div key={label} className="usr-creds__row">
                  <span>
                    <small>{label}</small>
                    <code>{value}</code>
                  </span>
                  <Button size="slim" onClick={() => void copyText(value).then(() => showSuccess(`${label} copied`))}>
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}

export default function UsersSettingsPage() {
  return (
    <Suspense fallback={null}>
      <UsersInner />
    </Suspense>
  );
}
