"use client";

import {
  ActionList,
  Badge,
  Button,
  Icon,
  Modal,
  Popover,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  EditIcon,
  LocationIcon,
  MenuHorizontalIcon,
  PersonIcon,
  ReplayIcon,
  SearchIcon,
  StoreIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { BranchFormModal, sampleNumber, type NumberingFormat } from "@/components/settings/branch-form-modal";
import {
  deactivateBranch,
  listBranches,
  listMembers,
  reactivateBranch,
  type Branch,
  type OrganizationMember,
} from "@/lib/security-api";
import { getDocumentTemplates } from "@/lib/settings-api";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "inactive";

function localTime(zone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date());
  } catch {
    return null;
  }
}

function addressLine(branch: Branch) {
  return [branch.street1, branch.street2, branch.city, branch.countryCode].filter((v) => v && v.trim()).join(", ");
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function BranchSettingsPage() {
  const { showError, showSuccess } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [format, setFormat] = useState<NumberingFormat | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<Branch | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, people, templates] = await Promise.all([
        listBranches(),
        listMembers().catch(() => null),
        getDocumentTemplates().catch(() => null),
      ]);
      setBranches(list);
      setMembers(people);
      setFormat((templates?.documentNumberingFormat as NumberingFormat | undefined) ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the local clocks current.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const peopleByBranch = useMemo(() => {
    const map = new Map<string, OrganizationMember[]>();
    for (const m of members ?? []) {
      for (const b of m.branches) map.set(b.branchId, [...(map.get(b.branchId) ?? []), m]);
    }
    return map;
  }, [members]);

  const counts = {
    all: branches.length,
    active: branches.filter((b) => b.isActive).length,
    inactive: branches.filter((b) => !b.isActive).length,
  };
  const mainBranch = branches.find((b) => b.isMain);
  const zones = [...new Set(branches.filter((b) => b.isActive).map((b) => b.timezone || "UTC"))];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches
      .filter((b) => (filter === "active" ? b.isActive : filter === "inactive" ? !b.isActive : true))
      .filter((b) =>
        !q ? true : [b.name, b.code, b.documentPrefix, b.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(b.isMain) - Number(a.isMain) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [branches, filter, query]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    setBusyId(pendingDeactivate.id);
    try {
      await deactivateBranch(pendingDeactivate.id);
      showSuccess(`${pendingDeactivate.name} deactivated`);
      setPendingDeactivate(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't deactivate the branch");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReactivate(branch: Branch) {
    setBusyId(branch.id);
    try {
      await reactivateBranch(branch.id);
      showSuccess(`${branch.name} is active again`);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't reactivate the branch");
    } finally {
      setBusyId(null);
    }
  }

  void now;

  return (
    <AppPage
      fullWidth
      title="Branches"
      subtitle="Locations with their own stock, transactions and document numbers."
      primaryAction={{ content: "Add branch", onAction: openCreate }}
    >
      <div className="brs">
        {loadError ? (
          <div className="ac-error">
            <span>{loadError}</span>
            <button className="st-link" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        {/* ── Summary ── */}
        <section className={cn("pl-hero brs-hero", loading && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Branch network</span>
            <span className="pl-hero__value">{loading ? "—" : counts.active}</span>
            <span className="pl-hero__period">
              active location{counts.active === 1 ? "" : "s"}
              {counts.inactive ? ` · ${counts.inactive} inactive` : ""}
            </span>
          </div>
          <div className="pl-hero__tiles">
            <div className="ac-tile">
              <span>Main branch</span>
              <strong>{mainBranch?.name ?? "—"}</strong>
              <small>{mainBranch ? `Code ${mainBranch.code} · can't be deactivated` : "Not set"}</small>
            </div>
            <div className="ac-tile">
              <span>People assigned</span>
              <strong>{members ? members.length : "—"}</strong>
              <small>
                <Link className="brs-hero__link" href="/dashboard/settings/users">
                  Manage in Users &amp; roles →
                </Link>
              </small>
            </div>
            <div className="ac-tile">
              <span>Time zones</span>
              <strong>{zones.length || "—"}</strong>
              <small>{zones.slice(0, 2).join(" · ").replace(/_/g, " ") || "—"}</small>
            </div>
          </div>
          <p className="brs-hero__rule">
            <b>Shared across branches:</b> products, customers, vendors and company settings. <b>Kept per branch:</b>{" "}
            stock, sales, purchases, accounting and ROV projects.
          </p>
        </section>

        {/* ── List ── */}
        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters" role="tablist" aria-label="Filter branches">
              {(
                [
                  ["all", "All"],
                  ["active", "Active"],
                  ["inactive", "Inactive"],
                ] as Array<[Filter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  className={cn("iv-filter", filter === id && "is-active")}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  label="Search branches"
                  labelHidden
                  autoComplete="off"
                  placeholder="Search name, code, city…"
                  prefix={<Icon source={SearchIcon} tone="subdued" />}
                  value={query}
                  onChange={setQuery}
                  clearButton
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
            </div>
          </div>

          {loading && !branches.length ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={5} />
            </div>
          ) : !branches.length ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={StoreIcon} />
              </span>
              <Text as="h3" variant="headingMd">
                No branches yet
              </Text>
              <p>Add a location to keep its stock, transactions and document numbers separate.</p>
              <Button variant="primary" onClick={openCreate}>
                Add branch
              </Button>
            </div>
          ) : !visible.length ? (
            <div className="ex-empty">
              <Text as="h3" variant="headingSm">
                No branches match
              </Text>
              <p>Try another filter or clear the search.</p>
              <Button
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Show all branches
              </Button>
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              {visible.map((branch) => {
                const people = peopleByBranch.get(branch.id) ?? [];
                const address = addressLine(branch);
                const time = localTime(branch.timezone || "UTC");
                const busy = busyId === branch.id;
                return (
                  <li key={branch.id} className={cn("brs-row", !branch.isActive && "is-inactive")}>
                    <span className={cn("brs-code", branch.isMain && "is-main")}>{branch.code.slice(0, 4)}</span>

                    <button
                      type="button"
                      className="ex-main"
                      onClick={() => {
                        setEditing(branch);
                        setFormOpen(true);
                      }}
                    >
                      <strong>
                        {branch.name}
                        {branch.isMain ? (
                          <Badge tone="info" size="small">
                            Main
                          </Badge>
                        ) : null}
                      </strong>
                      <small>
                        {address ? (
                          <span className="brs-addr">
                            <Icon source={LocationIcon} tone="subdued" />
                            {address}
                          </span>
                        ) : (
                          <span>No address</span>
                        )}
                      </small>
                    </button>

                    <span className="brs-cell">
                      <small>Numbers</small>
                      <code>{sampleNumber(branch.documentPrefix, "INV", format)}</code>
                    </span>

                    <span className="brs-cell">
                      <small>Local time</small>
                      <b>
                        {time ?? "—"} <em>{(branch.timezone || "UTC").replace(/_/g, " ")}</em>
                      </b>
                    </span>

                    <span className="brs-cell brs-people">
                      <small>People</small>
                      {members === null ? (
                        <b>—</b>
                      ) : people.length ? (
                        <span className="brs-avatars" title={people.map((p) => p.name || p.email).join(", ")}>
                          {people.slice(0, 3).map((p) => (
                            <i key={p.id}>{initials(p.name || p.email)}</i>
                          ))}
                          {people.length > 3 ? <i className="is-more">+{people.length - 3}</i> : null}
                        </span>
                      ) : (
                        <b className="brs-muted">
                          <Icon source={PersonIcon} tone="subdued" /> Nobody yet
                        </b>
                      )}
                    </span>

                    <span className="brs-status">
                      <Badge tone={branch.isActive ? "success" : undefined}>{branch.isActive ? "Active" : "Inactive"}</Badge>
                    </span>

                    <span className="brs-actions">
                      {branch.isActive ? (
                        <Button
                          size="slim"
                          icon={EditIcon}
                          onClick={() => {
                            setEditing(branch);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : (
                        <Button size="slim" icon={ReplayIcon} loading={busy} onClick={() => void handleReactivate(branch)}>
                          Reactivate
                        </Button>
                      )}
                      {!branch.isMain && branch.isActive ? (
                        <Popover
                          active={menuFor === branch.id}
                          activator={
                            <Button
                              accessibilityLabel={`More actions for ${branch.name}`}
                              icon={MenuHorizontalIcon}
                              size="slim"
                              variant="tertiary"
                              onClick={() => setMenuFor((v) => (v === branch.id ? null : branch.id))}
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
                                content: "Deactivate",
                                icon: XCircleIcon,
                                destructive: true,
                                onAction: () => setPendingDeactivate(branch),
                              },
                            ]}
                          />
                        </Popover>
                      ) : (
                        <span className="brs-actions__spacer" />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <BranchFormModal
        open={formOpen}
        branch={editing}
        branches={branches}
        numberingFormat={format}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(saved, created) => {
          showSuccess(created ? `${saved.name} created` : `${saved.name} updated`);
          void load();
        }}
      />

      <Modal
        open={Boolean(pendingDeactivate)}
        title={`Deactivate ${pendingDeactivate?.name ?? "branch"}?`}
        onClose={() => setPendingDeactivate(null)}
        primaryAction={{
          content: "Deactivate",
          destructive: true,
          loading: Boolean(busyId),
          onAction: () => void handleDeactivate(),
        }}
        secondaryActions={[{ content: "Cancel", disabled: Boolean(busyId), onAction: () => setPendingDeactivate(null) }]}
      >
        <Modal.Section>
          <div className="brs-confirm">
            <Text as="p">
              Nobody will be able to pick <strong>{pendingDeactivate?.name}</strong> for new transactions or assign people
              to it. You can reactivate it later.
            </Text>
            {pendingDeactivate && (peopleByBranch.get(pendingDeactivate.id)?.length ?? 0) > 0 ? (
              <p className="brs-confirm__note">
                <i className="st-dot is-low" /> {peopleByBranch.get(pendingDeactivate.id)?.length} people are assigned to
                this branch.
              </p>
            ) : null}
            <p className="brs-confirm__note">
              <i className="st-dot is-muted" /> Branches that already have warehouses, orders, invoices, purchase orders
              or ROV projects can&apos;t be deactivated.
            </p>
          </div>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
