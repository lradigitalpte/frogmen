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
import { correctExpenseClaimReimbursement, reimburseExpenseClaim, type ExpenseClaim } from "@/lib/expense-claims-api";

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

  const correcting = claim?.status === "reimbursed";
  const requiresBankAccount =
    paymentMethod !== "cash";

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
    setReimbursedDate(
      (correcting && (claim?.paymentDate ?? claim?.reimbursedAt?.slice(0, 10))) || todayIsoDate(),
    );
    setPaymentMethod((correcting && claim?.paymentMethod) || "bank_transfer");
    setError(null);
    // A correction may need to show an account that has since been deactivated.
    listBankAccounts({ activeOnly: !correcting })
      .then((accounts) => {
        setBankAccounts(accounts);
        const defaultBank =
          accounts.find((bank) => bank.isDefault) ?? accounts[0];
        setBankAccountId((correcting && claim?.bankAccountId) || defaultBank?.id || "");
      })
      .catch(() => {
        setBankAccounts([]);
        setBankAccountId("");
      });
  }, [open, claim, correcting]);

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
      const save = correcting ? correctExpenseClaimReimbursement : reimburseExpenseClaim;
      await save(claim.id, {
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
      title={`${correcting ? "Correct payment for" : "Reimburse"} ${claim?.number ?? "claim"}`}
      primaryAction={{
        content: correcting ? "Save correction" : "Record reimbursement",
        loading: saving,
        onAction: () => void handleReimburse(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <Banner tone="info">
            {correcting
              ? "The original journal entry is reversed and a corrected one is posted. The amount doesn't change."
              : "Recording reimbursement posts the company expense to your books (Dr Operating Expenses, Cr bank/cash)."}
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
