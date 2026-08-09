"use client";

import {
  Banner,
  BlockStack,
  Button,
  DropZone,
  FormLayout,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listExpenseCategories } from "@/lib/expenses-api";
import {
  createExpenseClaim,
  updateExpenseClaim,
  uploadExpenseClaimReceipt,
  type ExpenseClaim,
} from "@/lib/expense-claims-api";

interface ExpenseClaimFormModalProps {
  open: boolean;
  onClose: () => void;
  claim?: ExpenseClaim | null;
  onSaved: () => void;
}

export function ExpenseClaimFormModal({
  open,
  onClose,
  claim,
  onSaved,
}: ExpenseClaimFormModalProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const isEdit = Boolean(claim);

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reference, setReference] = useState("");
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void loadCategories();
  }, [open, loadCategories]);

  useEffect(() => {
    if (!open) return;

    if (claim) {
      setAmount(String(claim.amount));
      setExpenseDate(claim.expenseDate);
      setDescription(claim.description);
      setCategoryId(claim.categoryId ?? "");
      setReference(claim.reference ?? "");
    } else {
      setAmount("");
      setExpenseDate(todayIsoDate());
      setDescription("");
      setCategoryId("");
      setReference("");
    }
    setReceiptFile(null);
    setError(null);
  }, [open, claim]);

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

    setSaving(true);
    setError(null);

    try {
      const payload = {
        amount: parsedAmount,
        expenseDate,
        description: description.trim(),
        reference: reference.trim() || undefined,
        categoryId: categoryId || undefined,
      };

      let claimId = claim?.id;
      if (isEdit && claimId) {
        await updateExpenseClaim(claimId, {
          ...payload,
          reference: reference.trim() || null,
          categoryId: categoryId || null,
        });
      } else {
        const created = await createExpenseClaim(payload);
        claimId = created.id;
      }

      if (receiptFile && claimId) {
        await uploadExpenseClaimReceipt(claimId, receiptFile);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save claim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? `Edit claim ${claim?.number ?? ""}`
          : "New out-of-pocket expense claim"
      }
      primaryAction={{
        content: isEdit ? "Save draft" : "Save as draft",
        loading: saving,
        onAction: () => void handleSubmit(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <Banner tone="info">
            Save as draft, then submit for approval. The company only books this
            as an expense when your claim is reimbursed.
          </Banner>

          <FormLayout>
            <Select
              label="Category"
              options={categoryOptions}
              value={categoryId}
              onChange={handleCategoryChange}
            />
            <TextField
              autoComplete="off"
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="What did you buy and why?"
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
                label="Expense date"
                type="date"
                value={expenseDate}
                onChange={setExpenseDate}
              />
            </FormLayout.Group>
            <TextField
              autoComplete="off"
              label="Reference / memo (optional)"
              value={reference}
              onChange={setReference}
              placeholder="Receipt no., vendor, etc."
              helpText={
                isEdit && claim?.number
                  ? `Claim number: ${claim.number}`
                  : "A claim number is assigned when you save."
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
            {isEdit && claim?.hasReceipt ? (
              <Text as="p" tone="subdued" variant="bodySm">
                A receipt is on file. Upload a new file to replace it.
              </Text>
            ) : null}
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
