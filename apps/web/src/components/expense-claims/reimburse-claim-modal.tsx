"use client";

import {
  Banner,
  BlockStack,
  FormLayout,
  Modal,
  Select,
  TextField,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import { listBankAccounts, type BankAccount } from "@/lib/bank-accounts-api";
import { reimburseExpenseClaim, type ExpenseClaim } from "@/lib/expense-claims-api";

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Wire transfer", value: "wire_transfer" },
  { label: "Cheque", value: "cheque" },
];

interface ReimburseClaimModalProps {
  open: boolean;
  claim: ExpenseClaim | null;
  onClose: () => void;
  onReimbursed: () => void;
}

export function ReimburseClaimModal({
  open,
  claim,
  onClose,
  onReimbursed,
}: ReimburseClaimModalProps) {
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reimbursedDate, setReimbursedDate] = useState(todayIsoDate());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresBankAccount =
    paymentMethod !== "cash" && paymentMethod !== "cheque";

  const bankAccountOptions = useMemo(
    () =>
      bankAccounts.map((bank) => ({
        label: `${bank.name} (${bank.currencyCode})`,
        value: bank.id,
      })),
    [bankAccounts],
  );

  useEffect(() => {
    if (!open) return;
    setReimbursedDate(todayIsoDate());
    setPaymentMethod("bank_transfer");
    setError(null);
    listBankAccounts({ activeOnly: true })
      .then((accounts) => {
        setBankAccounts(accounts);
        const defaultBank =
          accounts.find((bank) => bank.isDefault) ?? accounts[0];
        setBankAccountId(defaultBank?.id ?? "");
      })
      .catch(() => {
        setBankAccounts([]);
        setBankAccountId("");
      });
  }, [open]);

  useEffect(() => {
    if (!requiresBankAccount || bankAccounts.length === 0) {
      if (!requiresBankAccount) setBankAccountId("");
      return;
    }
    const currentValid = bankAccounts.some((bank) => bank.id === bankAccountId);
    if (currentValid) return;
    const defaultBank =
      bankAccounts.find((bank) => bank.isDefault) ?? bankAccounts[0];
    setBankAccountId(defaultBank?.id ?? "");
  }, [requiresBankAccount, bankAccounts, bankAccountId]);

  async function handleReimburse() {
    if (!claim) return;
    if (requiresBankAccount && bankAccounts.length > 0 && !bankAccountId) {
      setError("Select a bank account for this payment.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await reimburseExpenseClaim(claim.id, {
        paymentMethod,
        bankAccountId:
          requiresBankAccount && bankAccountId ? bankAccountId : undefined,
        reimbursedDate,
      });
      onReimbursed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reimburse claim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reimburse ${claim?.number ?? "claim"}`}
      primaryAction={{
        content: "Record reimbursement",
        loading: saving,
        onAction: () => void handleReimburse(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <Banner tone="info">
            Recording reimbursement posts the company expense to your books (Dr
            Operating Expenses, Cr bank/cash).
          </Banner>
          <FormLayout>
            <Select
              label="Payment method"
              options={paymentMethods}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
            {requiresBankAccount ? (
              <Select
                label="Bank account"
                options={
                  bankAccountOptions.length
                    ? bankAccountOptions
                    : [{ label: "No bank accounts available", value: "" }]
                }
                value={bankAccountId}
                onChange={setBankAccountId}
                disabled={bankAccountOptions.length === 0}
              />
            ) : null}
            <TextField
              autoComplete="off"
              label="Payment date"
              type="date"
              value={reimbursedDate}
              onChange={setReimbursedDate}
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
