"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  createBranch,
  deactivateBranch,
  listBranches,
  type Branch,
} from "@/lib/security-api";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
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
  CircleCheck,
  FileText,
  GitBranch,
  MapPinned,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const timezoneOptions = [
  { label: "UTC", value: "UTC" },
  { label: "Dubai (GMT+4)", value: "Asia/Dubai" },
  { label: "London", value: "Europe/London" },
  { label: "New York", value: "America/New_York" },
  { label: "Singapore", value: "Asia/Singapore" },
  { label: "Sydney", value: "Australia/Sydney" },
];

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

export default function BranchSettingsPage() {
  const { showError, showSuccess } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<Branch | null>(
    null,
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [prefix, setPrefix] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setBranches(await listBranches());
    } catch (error) {
      setBranches([]);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load branches",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showCreateForm) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setShowCreateForm(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saving, showCreateForm]);

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive),
    [branches],
  );
  const mainBranch = branches.find((branch) => branch.isMain);

  function resetForm() {
    setName("");
    setCode("");
    setPrefix("");
    setTimezone("UTC");
  }

  async function handleCreate() {
    const branchName = name.trim();
    const branchCode = normalizeCode(code);
    const documentPrefix = normalizeCode(prefix || branchCode);

    if (!branchName || branchCode.length < 2) {
      showError("Enter a branch name and a code with at least 2 characters.");
      return;
    }

    setSaving(true);
    try {
      await createBranch({
        name: branchName,
        code: branchCode,
        documentPrefix,
        timezone,
      });
      resetForm();
      setShowCreateForm(false);
      await load();
      showSuccess("Branch created.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to create branch",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;

    setDeactivating(true);
    try {
      await deactivateBranch(pendingDeactivate.id);
      setPendingDeactivate(null);
      await load();
      showSuccess("Branch deactivated.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to deactivate branch",
      );
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <AppPage
      title="Branches"
      subtitle="Manage business locations, access boundaries, and document numbering."
      primaryAction={{
        content: "Add branch",
        onAction: () => setShowCreateForm(true),
      }}
    >
      <BlockStack gap="500">
        <section className="branch-settings__hero">
          <div className="branch-settings__hero-copy">
            <div className="branch-settings__hero-icon">
              <GitBranch aria-hidden size={24} />
            </div>
            <div>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingLg">
                  Your branch network
                </Text>
                <Badge tone="info">Organization-wide</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Keep transactions isolated while sharing products, customers,
                vendors, and company settings.
              </Text>
            </div>
          </div>

          <div className="branch-settings__stats">
            <div className="branch-settings__stat">
              <span>{loading ? " " : activeBranches.length}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Active locations
              </Text>
            </div>
            <div className="branch-settings__stat-divider" />
            <div className="branch-settings__stat">
              <span>{mainBranch?.code ?? " "}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Main branch
              </Text>
            </div>
          </div>
        </section>

        <div className="branch-settings__section-title">
          <div>
            <Text as="h2" variant="headingMd">
              Business locations
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Each branch keeps its own stock, transactions, and document
              numbering.
            </Text>
          </div>
          {!loading && !loadError ? (
            <Badge>{`${branches.length} total`}</Badge>
          ) : null}
        </div>

        {loading ? (
          <div className="branch-settings__loading">
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="p" tone="subdued">
                Loading branches…
              </Text>
            </InlineStack>
          </div>
        ) : loadError ? (
          <Card>
            <BlockStack gap="400">
              <Banner tone="critical" title="Branches could not be loaded">
                <p>{loadError}</p>
              </Banner>
              <InlineStack align="end">
                <Button onClick={() => void load()}>Try again</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : branches.length === 0 ? (
          <Card>
            <EmptyState
              action={{
                content: "Add branch",
                onAction: () => setShowCreateForm(true),
              }}
              heading="Create your first branch"
              image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
            >
              <p>
                Add a location to begin isolating stock, transactions, and
                document sequences.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {branches.map((branch) => (
              <Card key={branch.id}>
                <BlockStack gap="400">
                  <div className="branch-settings__branch-header">
                    <div className="branch-settings__branch-identity">
                      <div
                        className={`branch-settings__branch-avatar${
                          branch.isActive ? "" : " is-inactive"
                        }`}
                      >
                        <Building2 aria-hidden size={20} />
                      </div>
                      <div>
                        <InlineStack gap="150" blockAlign="center" wrap>
                          <Text as="h3" variant="headingMd">
                            {branch.name}
                          </Text>
                          {branch.isMain ? (
                            <Badge tone="info">Main</Badge>
                          ) : null}
                        </InlineStack>
                        <Text as="p" tone="subdued" variant="bodySm">
                          {branch.code}
                        </Text>
                      </div>
                    </div>
                    <Badge tone={branch.isActive ? "success" : undefined}>
                      {branch.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="branch-settings__details">
                    <div className="branch-settings__detail">
                      <FileText aria-hidden size={17} />
                      <div>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Document prefix
                        </Text>
                        <Text as="p" fontWeight="semibold">
                          {branch.documentPrefix}
                        </Text>
                      </div>
                    </div>
                    <div className="branch-settings__detail">
                      <MapPinned aria-hidden size={17} />
                      <div>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Timezone
                        </Text>
                        <Text as="p" fontWeight="semibold">
                          {branch.timezone || "UTC"}
                        </Text>
                      </div>
                    </div>
                  </div>

                  <div className="branch-settings__sequence">
                    <ShieldCheck aria-hidden size={17} />
                    <Text as="p" variant="bodySm">
                      Next invoices follow{" "}
                      <strong>{branch.documentPrefix}-INV-0001</strong>
                    </Text>
                  </div>

                  <div className="branch-settings__branch-footer">
                    <Text as="p" tone="subdued" variant="bodySm">
                      {branch.isMain
                        ? "The main branch cannot be deactivated."
                        : branch.isActive
                          ? "Operational and ready for assignments."
                          : "No longer available for new transactions."}
                    </Text>
                    {!branch.isMain && branch.isActive ? (
                      <Button
                        tone="critical"
                        variant="plain"
                        onClick={() => setPendingDeactivate(branch)}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        )}

        <div className="branch-settings__notice">
          <CircleCheck aria-hidden size={19} />
          <div>
            <Text as="p" fontWeight="semibold">
              Shared masters, isolated operations
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Products, customers, and vendors remain organization-wide. Stock,
              sales, purchases, accounting, and ROV records stay branch-scoped.
            </Text>
          </div>
        </div>
      </BlockStack>

      {showCreateForm ? (
        <div className="branch-create-panel">
          <div
            aria-hidden
            className="branch-create-panel__overlay"
            onClick={() => {
              if (!saving) setShowCreateForm(false);
            }}
          />
          <aside
            aria-labelledby="branch-create-panel-title"
            aria-modal="true"
            className="branch-create-panel__drawer"
            role="dialog"
          >
            <header className="branch-create-panel__header">
              <div>
                <Text as="h2" id="branch-create-panel-title" variant="headingLg">
                  Create branch
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Add a secure operational location.
                </Text>
              </div>
              <Button
                disabled={saving}
                variant="tertiary"
                onClick={() => setShowCreateForm(false)}
              >
                Close
              </Button>
            </header>

            <div className="branch-create-panel__body">
              <div className="branch-create-panel__intro">
                <div className="branch-settings__section-icon">
                  <Plus aria-hidden size={19} />
                </div>
                <div>
                  <Text as="h3" variant="headingMd">
                    Branch details
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    This creates an independent boundary for stock, transactions,
                    users, and document sequences.
                  </Text>
                </div>
              </div>

              <FormLayout>
                <TextField
                  autoComplete="organization"
                  label="Branch name"
                  placeholder="e.g. Dubai Operations"
                  value={name}
                  onChange={setName}
                />
                <TextField
                  autoComplete="off"
                  helpText="2–24 letters, numbers, hyphens, or underscores."
                  label="Branch code"
                  placeholder="DXB"
                  value={code}
                  onChange={(value) => {
                    const nextCode = normalizeCode(value);
                    if (!prefix || prefix === code) {
                      setPrefix(nextCode);
                    }
                    setCode(nextCode);
                  }}
                />
                <TextField
                  autoComplete="off"
                  helpText="Used at the beginning of branch document numbers."
                  label="Document prefix"
                  placeholder="DXB"
                  value={prefix}
                  onChange={(value) => setPrefix(normalizeCode(value))}
                />
                <Select
                  helpText="Used for branch dates, reminders, and reports."
                  label="Timezone"
                  options={timezoneOptions}
                  value={timezone}
                  onChange={setTimezone}
                />
              </FormLayout>

              <div className="branch-create-panel__preview">
                <FileText aria-hidden size={18} />
                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Invoice number preview
                  </Text>
                  <Text as="p" variant="headingMd">
                    {prefix || code || "DXB"}-INV-0001
                  </Text>
                </div>
              </div>

              <Banner tone="info">
                <p>
                  Owner and Admin roles automatically receive access. Other users
                  can be assigned after creation.
                </p>
              </Banner>
            </div>

            <footer className="branch-create-panel__footer">
              <Button
                disabled={saving}
                onClick={() => {
                  resetForm();
                  setShowCreateForm(false);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!name.trim() || code.length < 2}
                loading={saving}
                variant="primary"
                onClick={handleCreate}
              >
                Create branch
              </Button>
            </footer>
          </aside>
        </div>
      ) : null}

      <Modal
        open={Boolean(pendingDeactivate)}
        title={`Deactivate ${pendingDeactivate?.name ?? "branch"}?`}
        onClose={() => setPendingDeactivate(null)}
        primaryAction={{
          content: "Deactivate branch",
          destructive: true,
          loading: deactivating,
          onAction: handleDeactivate,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: deactivating,
            onAction: () => setPendingDeactivate(null),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              This branch will no longer be available for new transactions or
              member assignments.
            </Text>
            <Banner tone="warning">
              <p>
                Deactivation is blocked when the branch has operational records
                that require an active location.
              </p>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
