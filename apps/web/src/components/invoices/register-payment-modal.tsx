"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  Grid,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import type { CurrencyLike } from "@/lib/currency-utils";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { getExchangeRate } from "@/lib/currencies-api";
import type { Invoice } from "@/lib/invoices-api";

const PAYMENT_METHODS = [
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Wire transfer", value: "wire_transfer" },
  { label: "Cash", value: "cash" },
  { label: "Cheque", value: "cheque" },
  { label: "Card", value: "card" },
] as const;

export interface RegisterPaymentInput {
  amount: number;
  paymentDate: string;
  currencyId?: string;
  method: string;
  reference?: string;
}

interface RegisterPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  canPay: boolean;
  processing: boolean;
  currencyOptions: Array<{ label: string; value: string }>;
  resolveCurrency: (currencyId?: string | null) => CurrencyLike | null | undefined;
  onSubmit: (input: RegisterPaymentInput) => Promise<void>;
}

export function RegisterPaymentModal({
  open,
  onClose,
  invoice,
  canPay,
  processing,
  currencyOptions,
  resolveCurrency,
  onSubmit,
}: RegisterPaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrencyId, setPaymentCurrencyId] = useState(invoice.currencyId);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentToInvoiceRate, setPaymentToInvoiceRate] = useState(1);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const documentCurrency = useMemo(
    () => resolveCurrency(invoice.currencyId),
    [invoice.currencyId, resolveCurrency],
  );

  const paymentCurrency = useMemo(
    () => resolveCurrency(paymentCurrencyId || invoice.currencyId),
    [invoice.currencyId, paymentCurrencyId, resolveCurrency],
  );

  const amountPaid = invoice.amountPaid ?? 0;
  const outstanding = Math.max(invoice.amountTotal - amountPaid, 0);

  const fmtInvoice = (amount: number) =>
    formatCurrencyAmount(amount, documentCurrency);

  const fmtPayment = (amount: number) =>
    formatCurrencyAmount(amount, paymentCurrency);

  useEffect(() => {
    if (!open) return;

    setPaymentAmount(String(outstanding));
    setPaymentDate(todayIsoDate());
    setPaymentCurrencyId(invoice.currencyId);
    setPaymentMethod("bank_transfer");
    setPaymentReference("");
  }, [open, outstanding, invoice.currencyId]);

  const parsedAmount = Number(paymentAmount) || 0;
  const invoiceEquivalent = parsedAmount * paymentToInvoiceRate;
  const amountExceedsOutstanding =
    invoiceEquivalent - outstanding > 0.01;

  useEffect(() => {
    if (!open || !paymentCurrencyId) return;

    if (paymentCurrencyId === invoice.currencyId) {
      setPaymentToInvoiceRate(1);
      setRateError(null);
      setRateLoading(false);
      setPaymentAmount(String(outstanding));
      return;
    }

    let cancelled = false;
    setRateLoading(true);
    setRateError(null);

    void getExchangeRate(
      paymentCurrencyId,
      invoice.currencyId,
      paymentDate,
    )
      .then(({ rate, configured }) => {
        if (cancelled) return;
        if (!configured || !Number.isFinite(rate) || rate <= 0) {
          throw new Error(
            "No exchange rate is configured for this currency pair.",
          );
        }
        setPaymentToInvoiceRate(rate);
        setPaymentAmount(String(Math.round((outstanding / rate) * 100) / 100));
      })
      .catch((err) => {
        if (cancelled) return;
        setRateError(
          err instanceof Error ? err.message : "Could not load exchange rate",
        );
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    invoice.currencyId,
    open,
    outstanding,
    paymentCurrencyId,
    paymentDate,
  ]);

  async function handleSubmit() {
    await onSubmit({
      amount: parsedAmount,
      paymentDate,
      currencyId: paymentCurrencyId || invoice.currencyId,
      method: paymentMethod,
      reference: paymentReference.trim() || undefined,
    });
  }

  const primaryLabel =
    parsedAmount > 0
      ? `Register ${fmtPayment(parsedAmount)} payment`
      : "Register payment";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive payment   ${invoice.number}`}
      primaryAction={{
        content: primaryLabel,
        loading: processing,
        disabled:
          !canPay ||
          parsedAmount <= 0 ||
          amountExceedsOutstanding ||
          rateLoading ||
          Boolean(rateError),
        onAction: () => void handleSubmit(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="500">
          {!canPay ? (
            <Banner tone="warning">
              Post this invoice first. Payment can only be recorded on posted invoices.
            </Banner>
          ) : null}

          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="400"
          >
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="050">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Customer
                  </Text>
                  <Text as="p" fontWeight="semibold">
                    {invoice.customerName}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {invoice.customerEmail || " "}
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Invoice date
                  </Text>
                  <Text as="p" fontWeight="semibold">
                    {invoice.invoiceDate}
                  </Text>
                </BlockStack>
              </InlineStack>

              <Divider />

              <div className="quotation-summary-panel__rows">
                <div className="quotation-summary-row">
                  <Text as="span" tone="subdued">
                    Invoice total
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {fmtInvoice(invoice.amountTotal)}
                  </Text>
                </div>
                <div className="quotation-summary-row">
                  <Text as="span" tone="subdued">
                    Already paid
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {fmtInvoice(amountPaid)}
                  </Text>
                </div>
                <div className="quotation-summary-row">
                  <Text as="span" fontWeight="bold">
                    Amount due
                  </Text>
                  <Text as="span" variant="headingMd" fontWeight="bold">
                    {fmtInvoice(outstanding)}
                  </Text>
                </div>
              </div>
            </BlockStack>
          </Box>

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Payment details
              </Text>
              {outstanding > 0 ? (
                <Button
                  size="slim"
                  onClick={() =>
                    setPaymentAmount(
                      String(
                        Math.round(
                          (outstanding / paymentToInvoiceRate) * 100,
                        ) / 100,
                      ),
                    )
                  }
                >
                  Pay full balance
                </Button>
              ) : null}
            </InlineStack>

            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <TextField
                  autoComplete="off"
                  label="Amount to receive"
                  type="number"
                  min={0}
                  prefix={paymentCurrency?.symbol ?? documentCurrency?.symbol ?? ""}
                  value={paymentAmount}
                  onChange={setPaymentAmount}
                  error={
                    amountExceedsOutstanding
                      ? `Cannot exceed outstanding balance (${fmtInvoice(outstanding)})`
                      : undefined
                  }
                  helpText={`Outstanding on invoice: ${fmtInvoice(outstanding)}`}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <TextField
                  autoComplete="off"
                  label="Payment date"
                  type="date"
                  value={paymentDate}
                  onChange={setPaymentDate}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Select
                  label="Payment method"
                  options={[...PAYMENT_METHODS]}
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Select
                  label="Payment currency"
                  options={currencyOptions}
                  value={paymentCurrencyId}
                  onChange={setPaymentCurrencyId}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <TextField
                  autoComplete="off"
                  label="Reference / memo (optional)"
                  placeholder="Bank ref, cheque no., transaction ID..."
                  value={paymentReference}
                  onChange={setPaymentReference}
                />
              </Grid.Cell>
            </Grid>

            {paymentCurrencyId !== invoice.currencyId && !rateError ? (
              <Text as="p" tone="subdued" variant="bodySm">
                {rateLoading
                  ? "Loading exchange rate..."
                  : `${fmtPayment(parsedAmount)} equals approximately ${fmtInvoice(invoiceEquivalent)} at 1 ${paymentCurrency?.code ?? ""} = ${paymentToInvoiceRate.toLocaleString()} ${documentCurrency?.code ?? ""}.`}
              </Text>
            ) : null}

            {rateError ? <Banner tone="critical">{rateError}</Banner> : null}
          </BlockStack>

          <Banner tone="info">
            Payment clears accounts receivable for this invoice. Inventory and COGS are
            recorded when the invoice is posted   not at payment time.
            {paymentCurrencyId !== invoice.currencyId
              ? " Amounts in another currency are converted to invoice currency using the rate for the payment date."
              : null}
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
