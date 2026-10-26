"use client";

import {
  Banner,
  BlockStack,
  Button,
  FormLayout,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getInvoiceDocumentBankCandidates,
  type InvoicePaymentBankStatus,
} from "@/lib/invoice-document-bank";
import { createBankAccount, type BankAccount } from "@/lib/bank-accounts-api";
import { useOrgCurrency } from "@/hooks/use-org-currency";

interface InvoiceDocumentBankModalProps {
  open: boolean;
  onClose: () => void;
  currencyCode: string;
  bankAccounts: BankAccount[];
  status: InvoicePaymentBankStatus;
  initialBankAccountId?: string | null;
  saving?: boolean;
  onConfirm: (bankAccountId: string) => void | Promise<void>;
  onBankAccountCreated?: (account: BankAccount) => void;
}

export function InvoiceDocumentBankModal({
  open,
  onClose,
  currencyCode,
  bankAccounts,
  status,
  initialBankAccountId,
  saving,
  onConfirm,
  onBankAccountCreated,
}: InvoiceDocumentBankModalProps) {
  const { currencies } = useOrgCurrency();
  const [createName, setCreateName] = useState("");
  const [createBankName, setCreateBankName] = useState("");
  const [createIban, setCreateIban] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const currencyId = useMemo(() => {
    const normalized = currencyCode.trim().toUpperCase();
    return currencies.find((c) => c.code.trim().toUpperCase() === normalized)?.id;
  }, [currencies, currencyCode]);

  const candidates = useMemo(
    () => getInvoiceDocumentBankCandidates(bankAccounts, currencyCode),
    [bankAccounts, currencyCode],
  );

  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    const preferred =
      initialBankAccountId &&
      candidates.some((account) => account.id === initialBankAccountId)
        ? initialBankAccountId
        : candidates.find((account) => account.isDefault)?.id ??
          candidates[0]?.id ??
          "";
    setSelectedId(preferred);
    setCreateError(null);
  }, [open, initialBankAccountId, candidates]);

  async function handleCreateBank() {
    if (!currencyId) {
      setCreateError(`No ${currencyCode} currency is configured for this organization.`);
      return;
    }
    if (!createName.trim()) {
      setCreateError("Account label is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const account = await createBankAccount({
        name: createName.trim(),
        bankName: createBankName.trim() || undefined,
        iban: createIban.trim() || undefined,
        currencyId,
        showOnDocuments: true,
      });
      onBankAccountCreated?.(account);
      await onConfirm(account.id);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create bank account",
      );
    } finally {
      setCreating(false);
    }
  }

  const options = candidates.map((account) => ({
    label: `${account.name} (${account.currencyCode})${
      account.isDefault ? " — Default" : ""
    }`,
    value: account.id,
  }));

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Payment bank for invoice PDF"
      primaryAction={
        status === "choose"
          ? {
              content: "Use on invoice",
              loading: saving,
              disabled: !selectedId || saving,
              onAction: () => void onConfirm(selectedId),
            }
          : status === "missing"
            ? {
                content: "Create & use on invoice",
                loading: creating || saving,
                disabled: creating || saving || !createName.trim(),
                onAction: () => void handleCreateBank(),
              }
            : undefined
      }
      secondaryActions={[
        {
          content: status === "missing" ? "Close" : "Cancel",
          disabled: saving || creating,
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {status === "missing" ? (
            <>
              <Banner tone="warning">
                No {currencyCode} bank account is marked{" "}
                <strong>Show on documents</strong>. Create one here or in
                settings.
              </Banner>
              <FormLayout>
                <TextField
                  label="Account label"
                  value={createName}
                  onChange={setCreateName}
                  autoComplete="off"
                  placeholder={`Company ${currencyCode} account`}
                />
                <TextField
                  label="Bank name"
                  value={createBankName}
                  onChange={setCreateBankName}
                  autoComplete="off"
                />
                <TextField
                  label="IBAN"
                  value={createIban}
                  onChange={setCreateIban}
                  autoComplete="off"
                />
              </FormLayout>
              {createError ? (
                <Banner tone="critical">{createError}</Banner>
              ) : null}
              <Link href="/dashboard/settings/bank-accounts">
                <Button variant="plain">Open full bank settings</Button>
              </Link>
            </>
          ) : (
            <>
              <Text as="p">
                This invoice is in <strong>{currencyCode}</strong>. Choose which
                bank details appear in the PDF payment section.
              </Text>
              <Select
                label="Bank account"
                options={options}
                value={selectedId}
                onChange={setSelectedId}
              />
            </>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
