"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  createBankAccount,
  deactivateBankAccount,
  listBankAccounts,
  updateBankAccount,
  type BankAccount,
} from "@/lib/bank-accounts-api";
import { listCurrencies } from "@/lib/currencies-api";
import { listBranches, type Branch } from "@/lib/security-api";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormLayout,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { Landmark } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function BankAccountsSettingsPage() {
  const { showError, showSuccess } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currencies, setCurrencies] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<BankAccount | null>(
    null,
  );
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [swiftCode, setSwiftCode] = useState("");
  const [currencyId, setCurrencyId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showOnDocuments, setShowOnDocuments] = useState(true);
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const currencyOptions = useMemo(
    () =>
      currencies.map((currency) => ({
        label: `${currency.code} — ${currency.name}`,
        value: currency.id,
      })),
    [currencies],
  );

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive),
    [branches],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [accountRows, branchRows, currencyRows] = await Promise.all([
        listBankAccounts({ activeOnly: false }),
        listBranches(),
        listCurrencies(),
      ]);
      setAccounts(accountRows);
      setBranches(branchRows);
      setCurrencies(currencyRows);
      setCurrencyId((current) => current || currencyRows[0]?.id || "");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load bank accounts",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditing(null);
    setName("");
    setBankName("");
    setAccountNumber("");
    setIban("");
    setSwiftCode("");
    setCurrencyId(currencies[0]?.id ?? "");
    setIsDefault(false);
    setShowOnDocuments(true);
    setBranchIds([]);
  }

  function openCreate() {
    resetForm();
    setPanelOpen(true);
  }

  function openEdit(account: BankAccount) {
    setEditing(account);
    setName(account.name);
    setBankName(account.bankName ?? "");
    setAccountNumber(account.accountNumber ?? "");
    setIban(account.iban ?? "");
    setSwiftCode(account.swiftCode ?? "");
    setCurrencyId(account.currencyId);
    setIsDefault(account.isDefault);
    setShowOnDocuments(account.showOnDocuments);
    setBranchIds(account.branchIds);
    setPanelOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !currencyId) {
      showError("Name and currency are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        iban: iban.trim(),
        swiftCode: swiftCode.trim(),
        currencyId,
        isDefault,
        showOnDocuments,
        branchIds,
      };

      if (editing) {
        await updateBankAccount(editing.id, payload);
        showSuccess("Bank account updated.");
      } else {
        await createBankAccount(payload);
        showSuccess("Bank account created.");
      }

      setPanelOpen(false);
      resetForm();
      await load();
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Unable to save bank account",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    setSaving(true);
    try {
      await deactivateBankAccount(pendingDeactivate.id);
      setPendingDeactivate(null);
      showSuccess("Bank account deactivated.");
      await load();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Unable to deactivate bank account",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage
      title="Bank accounts"
      subtitle="Manage receiving accounts for customer payments and expenses. Each bank gets its own GL balance."
      primaryAction={{
        content: "Add bank account",
        onAction: openCreate,
      }}
    >
      <BlockStack gap="500">
        {loading ? (
          <Card>
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="p" tone="subdued">
                Loading bank accounts…
              </Text>
            </InlineStack>
          </Card>
        ) : loadError ? (
          <Banner tone="critical" title="Bank accounts could not be loaded">
            <p>{loadError}</p>
          </Banner>
        ) : accounts.length === 0 ? (
          <Card>
            <EmptyState
              heading="No bank accounts yet"
              image=""
              action={{ content: "Add bank account", onAction: openCreate }}
            >
              <p>
                Create separate accounts for USD, AED, or other currencies to
                track receipts and expenses per bank.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="300">
            {accounts.map((account) => (
              <Card key={account.id}>
                <InlineStack align="space-between" blockAlign="start" wrap>
                  <InlineStack gap="300" blockAlign="start" wrap>
                    <div className="users-settings__section-icon">
                      <Landmark aria-hidden size={18} />
                    </div>
                    <BlockStack gap="100">
                      <InlineStack gap="150" blockAlign="center" wrap>
                        <Text as="h3" variant="headingMd">
                          {account.name}
                        </Text>
                        <Badge>{account.currencyCode}</Badge>
                        {account.isDefault ? (
                          <Badge tone="success">Default</Badge>
                        ) : null}
                        {!account.isActive ? (
                          <Badge tone="critical">Inactive</Badge>
                        ) : null}
                      </InlineStack>
                      <Text as="p" tone="subdued" variant="bodySm">
                        GL {account.glAccountCode}
                        {account.bankName ? ` · ${account.bankName}` : ""}
                        {account.accountNumber
                          ? ` · ${account.accountNumber}`
                          : ""}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        {account.branchIds.length === 0
                          ? "All branches"
                          : account.branchIds
                              .map(
                                (id) =>
                                  branches.find((branch) => branch.id === id)
                                    ?.name ?? id,
                              )
                              .join(", ")}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="150">
                    <Button size="slim" onClick={() => openEdit(account)}>
                      Edit
                    </Button>
                    {account.isActive ? (
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => setPendingDeactivate(account)}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                  </InlineStack>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        )}
      </BlockStack>

      <Modal
        open={panelOpen}
        title={editing ? "Edit bank account" : "Add bank account"}
        onClose={() => {
          if (!saving) {
            setPanelOpen(false);
            resetForm();
          }
        }}
        primaryAction={{
          content: editing ? "Save changes" : "Create bank account",
          loading: saving,
          onAction: handleSave,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: saving,
            onAction: () => {
              setPanelOpen(false);
              resetForm();
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              A dedicated GL account is created automatically for each bank.
            </Banner>
            <FormLayout>
              <TextField
                autoComplete="off"
                label="Display name"
                placeholder="ENBD AED Operating"
                value={name}
                onChange={setName}
              />
              <TextField
                autoComplete="off"
                label="Bank name"
                value={bankName}
                onChange={setBankName}
              />
              <TextField
                autoComplete="off"
                label="Account number"
                value={accountNumber}
                onChange={setAccountNumber}
              />
              <TextField autoComplete="off" label="IBAN" value={iban} onChange={setIban} />
              <TextField
                autoComplete="off"
                label="SWIFT / BIC"
                value={swiftCode}
                onChange={setSwiftCode}
              />
              <Select
                label="Currency"
                options={currencyOptions}
                value={currencyId}
                onChange={setCurrencyId}
              />
            </FormLayout>
            <Checkbox
              checked={isDefault}
              label="Default receiving account"
              onChange={setIsDefault}
            />
            <Checkbox
              checked={showOnDocuments}
              label="Show on invoices and quotations"
              onChange={setShowOnDocuments}
            />
            <div>
              <Text as="h3" variant="headingSm">
                Branch access
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Leave all unchecked to allow every branch. Otherwise only
                selected branches can use this account.
              </Text>
              <div className="user-invite-panel__branch-list">
                {activeBranches.map((branch) => (
                  <Checkbox
                    key={branch.id}
                    checked={branchIds.includes(branch.id)}
                    label={branch.name}
                    onChange={(checked) =>
                      setBranchIds((current) =>
                        checked
                          ? [...new Set([...current, branch.id])]
                          : current.filter((id) => id !== branch.id),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(pendingDeactivate)}
        title="Deactivate bank account?"
        onClose={() => setPendingDeactivate(null)}
        primaryAction={{
          content: "Deactivate",
          destructive: true,
          loading: saving,
          onAction: handleDeactivate,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setPendingDeactivate(null),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            {pendingDeactivate?.name} will no longer be available for new
            payments. Existing accounting entries are preserved.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
