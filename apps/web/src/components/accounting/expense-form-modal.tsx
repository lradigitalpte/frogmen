"use client";

import {
  Banner,
  BlockStack,
  Button,
  DropZone,
  FormLayout,
  InlineStack,
  Link,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listBankAccounts, type BankAccount } from "@/lib/bank-accounts-api";
import {
  createExpense,
  listExpenseCategories,
  updateExpense,
  uploadExpenseReceipt,
  type ExpenseCategory,
  type ExpenseRecord,
} from "@/lib/expenses-api";

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Wire transfer", value: "wire_transfer" },
  { label: "Cheque", value: "cheque" },
];

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: ExpenseRecord | null;
  onSaved: () => void;
}

export function ExpenseFormModal({
  open,
  onClose,
  expense,
  onSaved,
}: ExpenseFormModalProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const isEdit = Boolean(expense);

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresBankAccount =
    paymentMethod !== "cash" && paymentMethod !== "cheque";

  const categoryOptions = useMemo(
    () => [
      { label: "No category", value: "" },
      ...categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    ],
    [categories],
  );

  const bankAccountOptions = useMemo(
    () =>
      bankAccounts.map((bank) => ({
        label: `${bank.name} (${bank.currencyCode})`,
        value: bank.id,
      })),
    [bankAccounts],
  );

  const loadCategories = useCallback(async () => {
    try {
      const result = await listExpenseCategories({ perPage: 200 });
      setCategories(result.data);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    listBankAccounts({ activeOnly: true })
      .then(setBankAccounts)
      .catch(() => setBankAccounts([]));
    void loadCategories();
  }, [open, loadCategories]);

  useEffect(() => {
    if (!open) return;

    if (expense) {
      setAmount(String(expense.amount));
      setExpenseDate(expense.expenseDate);
      setDescription(expense.description);
      setCategoryId(expense.categoryId ?? "");
      setPaymentMethod(expense.paymentMethod);
      setReference(expense.reference ?? "");
      setBankAccountId(expense.bankAccountId ?? "");
    } else {
      setAmount("");
      setExpenseDate(todayIsoDate());
      setDescription("");
      setCategoryId("");
      setPaymentMethod("cash");
      setReference("");
      setBankAccountId("");
    }
    setReceiptFile(null);
    setError(null);
  }, [open, expense]);

  useEffect(() => {
    if (!requiresBankAccount || bankAccounts.length === 0) {
      if (!isEdit) setBankAccountId("");
      return;
    }

    const currentValid = bankAccounts.some((bank) => bank.id === bankAccountId);
    if (currentValid) return;

    const defaultBank =
      bankAccounts.find((bank) => bank.isDefault) ?? bankAccounts[0];
    setBankAccountId(defaultBank?.id ?? "");
  }, [requiresBankAccount, bankAccounts, bankAccountId, isEdit]);

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    const category = categories.find((item) => item.id === value);
    if (category && !description.trim()) {
      setDescription(category.name);
    }
  }

  async function handleSubmit() {
    const parsedAmount = Number(amount);
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (requiresBankAccount && bankAccounts.length > 0 && !bankAccountId) {
      setError("Select a bank account for this payment.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        amount: parsedAmount,
        expenseDate,
        description: description.trim(),
        paymentMethod,
        reference: reference.trim() || undefined,
        bankAccountId:
          requiresBankAccount && bankAccountId ? bankAccountId : undefined,
        categoryId: categoryId || undefined,
      };

      let expenseId = expense?.id;
      if (isEdit && expenseId) {
        await updateExpense(expenseId, {
          ...payload,
          reference: reference.trim() || null,
          bankAccountId:
            requiresBankAccount && bankAccountId ? bankAccountId : null,
          categoryId: categoryId || null,
        });
      } else {
        const created = await createExpense(payload);
        expenseId = created.id;
      }

      if (receiptFile && expenseId) {
        await uploadExpenseReceipt(expenseId, receiptFile);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit expense ${expense?.number ?? ""}` : "Record expense"}
      primaryAction={{
        content: isEdit ? "Save changes" : "Record expense",
        loading: saving,
        onAction: () => void handleSubmit(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}

          <FormLayout>
            <Select
              label="Category"
              options={categoryOptions}
              value={categoryId}
              onChange={handleCategoryChange}
              helpText={
                <span>
                  Quick-pick a category or type your own description below.{" "}
                  <Link url="/dashboard/accounting/expense-categories">
                    Manage categories
                  </Link>
                </span>
              }
            />
            <TextField
              autoComplete="off"
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="e.g. Office supplies, fuel, courier"
            />
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                label={`Amount (${baseCurrencyCode})`}
                type="number"
                value={amount}
                onChange={setAmount}
                min={0}
                step={0.01}
              />
              <TextField
                autoComplete="off"
                label="Date"
                type="date"
                value={expenseDate}
                onChange={setExpenseDate}
              />
            </FormLayout.Group>
            <Select
              label="Paid from"
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
              label="Reference / memo (optional)"
              value={reference}
              onChange={setReference}
              placeholder="Receipt no., vendor ref, etc."
              helpText={
                isEdit
                  ? expense?.number
                    ? `Expense number: ${expense.number}`
                    : undefined
                  : "An expense number is assigned automatically."
              }
            />
          </FormLayout>

          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Receipt (optional)
            </Text>
            <DropZone
              allowMultiple={false}
              accept="image/*,.pdf"
              type="file"
              onDrop={(files) => setReceiptFile(files[0] ?? null)}
            >
              {receiptFile ? (
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p">{receiptFile.name}</Text>
                  <Button size="slim" onClick={() => setReceiptFile(null)}>
                    Remove
                  </Button>
                </InlineStack>
              ) : (
                <DropZone.FileUpload actionHint="JPEG, PNG, WebP, or PDF up to 10 MB" />
              )}
            </DropZone>
            {isEdit && expense?.hasReceipt ? (
              <Text as="p" tone="subdued" variant="bodySm">
                Current receipt on file. Upload a new file to replace it.
              </Text>
            ) : null}
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
