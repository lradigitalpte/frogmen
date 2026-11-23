"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  FormLayout,
  Icon,
  Modal,
  Pagination,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon, ShieldCheckMarkIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  createWarrantyPolicy,
  listWarrantyPolicies,
  seedDefaultWarrantyPolicy,
  updateWarrantyPolicy,
  type WarrantyPolicy,
} from "@/lib/warranty-api";

type View = "active" | "inactive" | "all";

const PAGE_SIZE = 12;
const PRESETS = [3, 6, 12, 24, 36];
const NO_USAGE = { registrations: 0, activeRegistrations: 0, products: 0 };

function durationLabel(months: number) {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

function addMonths(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function WarrantyPoliciesPage() {
  const { showSuccess } = useToast();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");
  const [page, setPage] = useState(1);
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WarrantyPolicy | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [toggling, setToggling] = useState<WarrantyPolicy | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  // Load everything once; policies are a short list and this keeps counts right.
  // The API seeds the starter policies on its own when an organisation has none.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listWarrantyPolicies({ perPage: 200 });
      setPolicies(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of policies) seen.set(nameKey(p.name), (seen.get(nameKey(p.name)) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [policies]);

  const counts = useMemo(
    () => ({
      active: policies.filter((p) => p.isActive).length,
      inactive: policies.filter((p) => !p.isActive).length,
      all: policies.length,
    }),
    [policies],
  );

  const totals = useMemo(
    () =>
      policies.reduce(
        (acc, p) => {
          const u = p.usage ?? NO_USAGE;
          acc.active += u.activeRegistrations;
          acc.registrations += u.registrations;
          acc.products += u.products;
          return acc;
        },
        { active: 0, registrations: 0, products: 0 },
      ),
    [policies],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return policies.filter((p) => {
      if (view === "active" && !p.isActive) return false;
      if (view === "inactive" && p.isActive) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term);
    });
  }, [policies, query, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ----- form -----
  const months = Number(durationMonths);
  const monthsValid = Number.isInteger(months) && months >= 1 && months <= 600;
  const trimmedName = name.trim();
  const nameTaken =
    Boolean(trimmedName) &&
    policies.some((p) => p.id !== editing?.id && nameKey(p.name) === nameKey(trimmedName));
  const nameError = !trimmedName ? "Give the policy a name" : nameTaken ? "Another policy already has this name" : undefined;
  const monthsError = monthsValid ? undefined : "Enter a whole number of months from 1 to 600";
  const editingUsage = editing?.usage ?? NO_USAGE;
  const durationChanged = editing ? months !== editing.durationMonths : false;

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setDurationMonths("12");
    setTouched(false);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(policy: WarrantyPolicy) {
    setEditing(policy);
    setName(policy.name);
    setDescription(policy.description ?? "");
    setDurationMonths(String(policy.durationMonths));
    setTouched(false);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setTouched(true);
    if (nameError || monthsError) return;
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        name: trimmedName,
        // Send an empty string (not undefined) so clearing the description sticks.
        description: description.trim(),
        durationMonths: months,
      };
      if (editing) {
        await updateWarrantyPolicy(editing.id, input);
        showSuccess(`Saved ${trimmedName}`);
      } else {
        await createWarrantyPolicy(input);
        showSuccess(`Created ${trimmedName}`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      await updateWarrantyPolicy(toggling.id, { isActive: !toggling.isActive });
      showSuccess(toggling.isActive ? `${toggling.name} deactivated` : `${toggling.name} is active again`);
      setToggling(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the policy");
      setToggling(null);
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    try {
      const before = policies.length;
      const result = await seedDefaultWarrantyPolicy();
      const added = result.meta.total - before;
      showSuccess(added > 0 ? `Added ${plural(added, "starter policy", "starter policies")}` : "Starter policies are already here");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add starter policies");
    } finally {
      setSeeding(false);
    }
  }

  function chooseView(next: View) {
    setView(next);
    setPage(1);
  }

  const toggleUsage = toggling?.usage ?? NO_USAGE;

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      primaryAction={{ content: "New policy", onAction: openCreate }}
      secondaryActions={[{ content: "Add starter policies", loading: seeding, onAction: () => void handleSeed() }]}
      subtitle="Coverage terms you can attach to products and sales."
      title="Warranty policies"
    >
      <div className="pl wp">
        {error ? <div className="ac-error">{error}</div> : null}

        {duplicates.size > 0 ? (
          <p className="ac-warn">
            {`${plural(duplicates.size, "policy name")} ${duplicates.size === 1 ? "is" : "are"} used twice. Rename or deactivate the extra copy so people pick the right one.`}
          </p>
        ) : null}

        <div className="pc-stats">
          <div className="pc-stat">
            <small>Active policies</small>
            <strong>{loading ? "…" : counts.active}</strong>
          </div>
          <div className="pc-stat">
            <small>Warranties running</small>
            <strong>{loading ? "…" : totals.active}</strong>
          </div>
          <div className="pc-stat">
            <small>Registered in total</small>
            <strong>{loading ? "…" : totals.registrations}</strong>
          </div>
          <div className="pc-stat">
            <small>Products with a default</small>
            <strong>{loading ? "…" : totals.products}</strong>
          </div>
        </div>

        <div className="wh-toolbar">
          <div className="iv-filters">
            {(["active", "inactive", "all"] as const).map((v) => (
              <button
                className={cn("iv-filter", view === v && "is-active")}
                key={v}
                type="button"
                onClick={() => chooseView(v)}
              >
                {v === "active" ? "Active" : v === "inactive" ? "Inactive" : "All"} <span>{counts[v]}</span>
              </button>
            ))}
          </div>
          <div className="wh-toolbar__search">
            <TextField
              autoComplete="off"
              clearButton
              label="Search policies"
              labelHidden
              placeholder="Search by name or description"
              prefix={<Icon source={SearchIcon} />}
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              onClearButtonClick={() => setQuery("")}
            />
          </div>
        </div>

        {loading && policies.length === 0 ? (
          <div className="wh-grid">
            {[0, 1, 2].map((i) => (
              <div className="wh-card" key={i}>
                <SkeletonBodyText lines={5} />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="ex-surface">
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ShieldCheckMarkIcon} />
              </span>
              <strong>
                {query.trim()
                  ? `No policies match “${query.trim()}”`
                  : view === "inactive"
                    ? "No inactive policies"
                    : "No warranty policies yet"}
              </strong>
              <p>
                {query.trim()
                  ? "Try a different name."
                  : view === "inactive"
                    ? "Policies you deactivate show up here and can be turned back on."
                    : "Create your own or add the starter set (12 months, 24 months and 90 days)."}
              </p>
              {!query.trim() && view !== "inactive" ? (
                <div className="wp-empty-actions">
                  <Button variant="primary" onClick={openCreate}>
                    New policy
                  </Button>
                  <Button loading={seeding} onClick={() => void handleSeed()}>
                    Add starter policies
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={cn("wh-grid", loading && "st-dim")}>
            {visible.map((policy) => {
              const u = policy.usage ?? NO_USAGE;
              const dup = duplicates.has(nameKey(policy.name));
              return (
                <article className={cn("wh-card wp-card", !policy.isActive && "is-archived")} key={policy.id}>
                  <div className="wp-card__head">
                    <span className="wp-card__term" aria-hidden>
                      <strong>{policy.durationMonths % 12 === 0 ? policy.durationMonths / 12 : policy.durationMonths}</strong>
                      <small>
                        {policy.durationMonths % 12 === 0
                          ? policy.durationMonths === 12
                            ? "year"
                            : "years"
                          : policy.durationMonths === 1
                            ? "month"
                            : "months"}
                      </small>
                    </span>
                    <span className="wp-card__title">
                      <strong>{policy.name}</strong>
                      <span>
                        {policy.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                        {dup ? <Badge tone="attention">Duplicate name</Badge> : null}
                      </span>
                    </span>
                  </div>

                  <p className={cn("wp-card__desc", !policy.description && "is-empty")}>
                    {policy.description || "No description. Add one so staff know what this covers."}
                  </p>

                  <div className="wh-card__stats">
                    <div className={cn(u.activeRegistrations > 0 && "is-good")}>
                      <strong>{u.activeRegistrations}</strong>
                      <small>running</small>
                    </div>
                    <div>
                      <strong>{u.registrations}</strong>
                      <small>registered</small>
                    </div>
                    <div>
                      <strong>{u.products}</strong>
                      <small>{u.products === 1 ? "product" : "products"}</small>
                    </div>
                  </div>

                  <div className="wh-card__actions">
                    <Button size="slim" onClick={() => openEdit(policy)}>
                      Edit
                    </Button>
                    {u.registrations > 0 ? (
                      <Button size="slim" url="/dashboard/warranty" variant="tertiary">
                        View warranties
                      </Button>
                    ) : null}
                    <span className="wh-card__spacer" />
                    <Button
                      size="slim"
                      variant="tertiary"
                      onClick={() => setToggling(policy)}
                    >
                      {policy.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filtered.length > PAGE_SIZE ? (
          <div className="ex-surface">
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
                </strong>{" "}
                of <strong>{filtered.length}</strong> policies
              </span>
              <Pagination
                hasNext={safePage < totalPages}
                hasPrevious={safePage > 1}
                label={`${safePage} / ${totalPages}`}
                onNext={() => setPage(safePage + 1)}
                onPrevious={() => setPage(safePage - 1)}
              />
            </div>
          </div>
        ) : null}

        <p className="pl-foot">
          Coverage starts when the item is delivered. Changing a policy&apos;s length only affects warranties registered
          after the change. <NextLink href="/dashboard/warranty/new">Register a warranty</NextLink>
        </p>
      </div>

      <Modal
        open={modalOpen}
        primaryAction={{
          content: editing ? "Save changes" : "Create policy",
          loading: saving,
          disabled: touched && Boolean(nameError || monthsError),
          onAction: () => void handleSave(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
        title={editing ? `Edit ${editing.name}` : "New warranty policy"}
        onClose={() => setModalOpen(false)}
      >
        <Modal.Section>
          <FormLayout>
            {formError ? <div className="ac-error">{formError}</div> : null}
            <TextField
              autoComplete="off"
              error={touched ? nameError : nameTaken ? nameError : undefined}
              label="Policy name"
              placeholder="e.g. 12-month manufacturer warranty"
              value={name}
              onBlur={() => setTouched(true)}
              onChange={setName}
            />
            <div className="wp-duration">
              <TextField
                autoComplete="off"
                error={touched ? monthsError : undefined}
                label="Length"
                max={600}
                min={1}
                suffix="months"
                type="number"
                value={durationMonths}
                onChange={setDurationMonths}
              />
              <ButtonGroup variant="segmented">
                {PRESETS.map((m) => (
                  <Button key={m} pressed={months === m} onClick={() => setDurationMonths(String(m))}>
                    {m % 12 === 0 ? `${m / 12}y` : `${m}m`}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
            {monthsValid ? (
              <Text as="p" tone="subdued" variant="bodySm">
                {`${durationLabel(months)}. Something delivered today would be covered until ${formatAppDate(addMonths(months))}.`}
              </Text>
            ) : null}
            {durationChanged && editingUsage.registrations > 0 ? (
              <div className="ac-warn">
                {`${plural(editingUsage.registrations, "warranty", "warranties")} already use this policy`}
                . Their end dates stay as they are; only new registrations get the new length.
              </div>
            ) : null}
            <TextField
              autoComplete="off"
              helpText="Shown to staff when they pick a policy. Say what's covered and what isn't."
              label="What it covers"
              multiline={3}
              value={description}
              onChange={setDescription}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(toggling)}
        primaryAction={{
          content: toggling?.isActive ? "Deactivate policy" : "Activate policy",
          destructive: Boolean(toggling?.isActive),
          loading: toggleBusy,
          onAction: () => void handleToggle(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setToggling(null) }]}
        title={toggling ? `${toggling.isActive ? "Deactivate" : "Activate"} ${toggling.name}?` : "Policy"}
        onClose={() => setToggling(null)}
      >
        <Modal.Section>
          <Text as="p">
            {toggling?.isActive
              ? toggleUsage.activeRegistrations > 0 || toggleUsage.products > 0
                ? plural(toggleUsage.activeRegistrations, "running warranty", "running warranties") +
                  ` keep their coverage. It won't be offered for new sales${toggleUsage.products > 0 ? `, and ${plural(toggleUsage.products, "product")} using it as a default will need a new one` : ""}.`
                : "It won't be offered for new sales or products. You can turn it back on any time."
              : "It will be available again when picking a warranty for products and sales."}
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
