"use client";

import {
  Banner,
  Button,
  DropZone,
  Form,
  Icon,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { NoteIcon, ReceiptIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listExpenseCategories } from "@/lib/expenses-api";
import {
  createExpenseClaim,
  getExpenseClaimReceiptUrl,
  submitExpenseClaim,
  updateExpenseClaim,
  uploadExpenseClaimReceipt,
  type ExpenseClaim,
} from "@/lib/expense-claims-api";
import { cn } from "@/lib/utils";

export type ExpenseClaimSaveResult = "draft" | "submitted";

interface ExpenseClaimFormModalProps {
  open: boolean;
  onClose: () => void;
  claim?: ExpenseClaim | null;
  onSaved: (result: ExpenseClaimSaveResult) => void;
}

interface FieldErrors {
  amount?: string;
  description?: string;
  expenseDate?: string;
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ExpenseClaimFormModal({ open, onClose, claim, onSaved }: ExpenseClaimFormModalProps) {
  const { baseCurrencyCode, formatBaseMoney } = useOrgCurrency();
  const isEdit = Boolean(claim);

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reference, setReference] = useState("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentReceiptBroken, setCurrentReceiptBroken] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<ExpenseClaimSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once the draft exists, so a failed receipt upload retries without a duplicate claim.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => [
      { label: "Choose a category", value: "" },
      ...categories.map((category) => ({ label: category.name, value: category.id })),
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
    setCreatedId(null);
    setCurrentReceiptBroken(false);
    setErrors({});
    setError(null);
  }, [open, claim]);

  // Local preview for a newly chosen image.
  useEffect(() => {
    if (!receiptFile || !receiptFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(receiptFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    const category = categories.find((item) => item.id === value);
    if (category && !description.trim()) setDescription(category.name);
  }

  const handleDrop = useCallback((_all: File[], accepted: File[], rejected: File[]) => {
    const file = accepted[0];
    if (!file) {
      if (rejected.length) setError("Receipts must be a JPEG, PNG, WebP or PDF file.");
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError(`${file.name} is ${fileSize(file.size)}. Receipts can be up to 10 MB.`);
      return;
    }
    setError(null);
    setReceiptFile(file);
  }, []);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) found.amount = "Enter the amount you paid";
    if (!description.trim()) found.description = "Say what you bought";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) found.expenseDate = "Choose the date you paid";
    else if (expenseDate > todayIsoDate()) found.expenseDate = "The date can't be in the future";
    return found;
  }

  async function save(mode: ExpenseClaimSaveResult) {
    if (saving) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(mode);
    setError(null);
    try {
      const payload = {
        amount: Number(amount),
        expenseDate,
        description: description.trim(),
      };

      let claimId = claim?.id ?? createdId ?? undefined;
      if (claimId) {
        await updateExpenseClaim(claimId, {
          ...payload,
          reference: reference.trim() || null,
          categoryId: categoryId || null,
        });
      } else {
        const created = await createExpenseClaim({
          ...payload,
          reference: reference.trim() || undefined,
          categoryId: categoryId || undefined,
        });
        claimId = created.id;
        setCreatedId(created.id);
      }

      if (receiptFile && claimId) {
        try {
          await uploadExpenseClaimReceipt(claimId, receiptFile);
          setReceiptFile(null);
        } catch (err) {
          throw new Error(
            `Claim saved, but the receipt didn't upload: ${err instanceof Error ? err.message : "unknown error"}. Try again or remove the file.`,
          );
        }
      }

      if (mode === "submitted" && claimId) {
        await submitExpenseClaim(claimId);
      }

      onSaved(mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the claim");
    } finally {
      setSaving(null);
    }
  }

  const parsedAmount = Number(amount);
  const amountLabel = Number.isFinite(parsedAmount) && parsedAmount > 0 ? formatBaseMoney(parsedAmount) : null;
  const hasCurrentReceipt = Boolean(isEdit && claim?.hasReceipt);
  const hasReceipt = Boolean(receiptFile) || hasCurrentReceipt;
  const today = todayIsoDate();
  const yesterday = isoDaysAgo(1);

  return (
    <Modal
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      size="large"
      title={isEdit ? `Edit ${claim?.number ?? "claim"}` : "New expense claim"}
      primaryAction={{
        content: amountLabel ? `Submit ${amountLabel}` : "Submit for approval",
        loading: saving === "submitted",
        disabled: saving === "draft",
        onAction: () => void save("submitted"),
      }}
      secondaryActions={[
        {
          content: "Save as draft",
          loading: saving === "draft",
          disabled: saving === "submitted",
          onAction: () => void save("draft"),
        },
        { content: "Cancel", disabled: Boolean(saving), onAction: onClose },
      ]}
    >
      <Modal.Section>
        <Form onSubmit={() => void save("draft")} implicitSubmit={false}>
          <div className="ecf">
            {error ? (
              <div className="ecf__error">
                <Banner tone="critical" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              </div>
            ) : null}

            {/* ── Details ── */}
            <div className="ecf__main">
              <section className="ecf__amount">
                <div className="ecf__amount-field">
                  <TextField
                    autoComplete="off"
                    label="Amount you paid"
                    type="number"
                    inputMode="decimal"
                    prefix={baseCurrencyCode}
                    placeholder="0.00"
                    value={amount}
                    onChange={(v) => {
                      setAmount(v);
                      setErrors((e) => ({ ...e, amount: undefined }));
                    }}
                    min={0}
                    step={0.01}
                    error={errors.amount}
                    disabled={Boolean(saving)}
                    autoFocus={!isEdit}
                  />
                </div>
                <div className="ecf__date">
                  <TextField
                    autoComplete="off"
                    label="Date paid"
                    type="date"
                    value={expenseDate}
                    max={today}
                    onChange={(v) => {
                      setExpenseDate(v);
                      setErrors((e) => ({ ...e, expenseDate: undefined }));
                    }}
                    error={errors.expenseDate}
                    disabled={Boolean(saving)}
                  />
                  <div className="ecf__chips" role="group" aria-label="Quick dates">
                    {[
                      { label: "Today", value: today },
                      { label: "Yesterday", value: yesterday },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className={cn("ecf__chip", expenseDate === chip.value && "is-on")}
                        disabled={Boolean(saving)}
                        onClick={() => {
                          setExpenseDate(chip.value);
                          setErrors((e) => ({ ...e, expenseDate: undefined }));
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <TextField
                autoComplete="off"
                label="What was it for?"
                value={description}
                onChange={(v) => {
                  setDescription(v);
                  setErrors((e) => ({ ...e, description: undefined }));
                }}
                placeholder="e.g. Taxi to client site, cable ties for the dive job"
                maxLength={200}
                error={errors.description}
                disabled={Boolean(saving)}
              />

              <div className="ecf__pair">
                <Select
                  label="Category"
                  options={categoryOptions}
                  value={categoryId}
                  onChange={handleCategoryChange}
                  disabled={Boolean(saving)}
                />
                <TextField
                  autoComplete="off"
                  label="Reference"
                  value={reference}
                  onChange={setReference}
                  placeholder="Receipt no. or shop"
                  helpText="Optional"
                  disabled={Boolean(saving)}
                />
              </div>

              <p className="ecf__note">
                {isEdit && claim?.number ? (
                  <>
                    Claim <b>{claim.number}</b> ·{" "}
                  </>
                ) : (
                  <>A claim number is assigned when you save · </>
                )}
                It only reaches the company&apos;s books once finance pays you back.
              </p>
            </div>

            {/* ── Receipt ── */}
            <aside className="ecf__side">
              <div className="ecf__side-head">
                <Text as="h3" variant="headingSm">
                  Receipt
                </Text>
                {hasReceipt ? null : (
                  <Text as="span" tone="subdued" variant="bodySm">
                    Recommended
                  </Text>
                )}
              </div>

              <div className="ecf__zone">
                <DropZone
                  allowMultiple={false}
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  type="file"
                  disabled={Boolean(saving)}
                  onDrop={handleDrop}
                  label="Receipt"
                  labelHidden
                >
                  {receiptFile ? (
                    previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="ecf__preview" src={previewUrl} alt="Receipt preview" />
                    ) : (
                      <div className="ecf__empty">
                        <span className="ecf__icon">
                          <Icon source={NoteIcon} />
                        </span>
                        <Text as="span" fontWeight="semibold">
                          PDF receipt
                        </Text>
                      </div>
                    )
                  ) : hasCurrentReceipt && claim && !currentReceiptBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="ecf__preview"
                      src={getExpenseClaimReceiptUrl(claim.id)}
                      alt="Current receipt"
                      onError={() => setCurrentReceiptBroken(true)}
                    />
                  ) : hasCurrentReceipt ? (
                    <div className="ecf__empty">
                      <span className="ecf__icon">
                        <Icon source={NoteIcon} />
                      </span>
                      <Text as="span" fontWeight="semibold">
                        Receipt on file
                      </Text>
                    </div>
                  ) : (
                    <div className="ecf__empty">
                      <span className="ecf__icon">
                        <Icon source={ReceiptIcon} />
                      </span>
                      <Text as="span" fontWeight="semibold">
                        Drop a photo or PDF
                      </Text>
                      <Text as="span" tone="subdued" variant="bodySm">
                        or click to choose · up to 10 MB
                      </Text>
                    </div>
                  )}
                </DropZone>
              </div>

              {receiptFile ? (
                <div className="ecf__file">
                  <span>
                    <b>{receiptFile.name}</b>
                    <small>
                      {fileSize(receiptFile.size)}
                      {hasCurrentReceipt ? " · replaces the current receipt" : ""}
                    </small>
                  </span>
                  <Button variant="plain" disabled={Boolean(saving)} onClick={() => setReceiptFile(null)}>
                    {hasCurrentReceipt ? "Undo" : "Remove"}
                  </Button>
                </div>
              ) : hasCurrentReceipt && claim ? (
                <div className="ecf__file">
                  <span>
                    <b>Current receipt</b>
                    <small>Drop a new file to replace it</small>
                  </span>
                  <Button variant="plain" url={getExpenseClaimReceiptUrl(claim.id)} external>
                    Open
                  </Button>
                </div>
              ) : (
                <p className="ecf__hint">Claims with a clear receipt are approved faster.</p>
              )}

              <ol className="ecf__steps" aria-label="What happens next">
                <li className="is-now">
                  <b>{isEdit ? "Update" : "Save"} your claim</b>
                  <small>Keep it as a draft or send it straight away</small>
                </li>
                <li>
                  <b>Finance reviews it</b>
                  <small>You can pull it back until it&apos;s approved</small>
                </li>
                <li>
                  <b>You get paid back</b>
                  <small>By cash or bank transfer</small>
                </li>
              </ol>
            </aside>
          </div>
        </Form>
      </Modal.Section>
    </Modal>
  );
}
