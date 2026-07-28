"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  IndexTable,
  InlineStack,
  Layout,
  Link,
  Modal,
  ProgressBar,
  Text,
  TextField,
} from "@shopify/polaris";
import { Building2, Package, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { PurchaseOrderNextSteps } from "@/components/purchasing/purchase-order-next-steps";
import { PurchaseOrderWorkflowPanel } from "@/components/purchasing/purchase-order-workflow-panel";
import { ReceiveGoodsModal } from "@/components/purchasing/receive-goods-modal";
import { formatMoney } from "@/components/sales/format-money";
import {
  purchaseOrderStateLabel,
  purchaseOrderStateVariant,
  purchaseReceiptStatusLabel,
  purchaseReceiptStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import {
  addPurchaseOrderNote,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrder,
  sendPurchaseOrderEmail,
  type PurchaseActivity,
  type PurchaseOrder,
} from "@/lib/purchase-orders-api";
import { useToast } from "@/components/providers/toast-provider";

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatQuantity(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return " ";
  if (Number.isInteger(amount)) return String(amount);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatActivityActor(activity: PurchaseActivity) {
  return activity.userName?.trim() || activity.userEmail?.trim() || "System";
}

function activityTypeLabel(type: string) {
  switch (type) {
    case "note":
      return "Note";
    case "created":
      return "Created";
    case "confirmed":
      return "Confirmed";
    case "received":
      return "Received";
    case "cancelled":
      return "Cancelled";
    case "updated":
      return "Updated";
    default:
      return type;
  }
}

function activityTypeVariant(type: string) {
  if (type === "note") return "info" as const;
  if (type === "confirmed" || type === "received") return "success" as const;
  if (type === "cancelled") return "destructive" as const;
  return "neutral" as const;
}

function receiptStateLabel(state: string) {
  switch (state) {
    case "done":
      return "Validated";
    case "draft":
      return "Draft";
    case "cancelled":
      return "Cancelled";
    default:
      return state;
  }
}

export function PurchaseOrderViewPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [noteText, setNoteText] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await getPurchaseOrder(orderId);
      setOrder(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load purchase order",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [orderId]);

  async function runAction(action: () => Promise<PurchaseOrder>) {
    setActionLoading(true);
    try {
      const updated = await action();
      setOrder(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  const receiptProgress = useMemo(() => {
    if (!order?.lines?.length) {
      return { ordered: 0, received: 0, remaining: 0, percent: 0 };
    }

    const ordered = order.lines.reduce(
      (sum, line) => sum + Number(line.quantity),
      0,
    );
    const received = order.lines.reduce(
      (sum, line) => sum + Number(line.qtyReceived),
      0,
    );
    const remaining = Math.max(ordered - received, 0);
    const percent = ordered > 0 ? Math.round((received / ordered) * 100) : 0;

    return { ordered, received, remaining, percent };
  }, [order?.lines]);

  if (loading && !order) {
    return (
      <AppPage
        backAction={{ url: "/dashboard/purchasing/orders" }}
        title="Purchase order"
      >
        <Text as="p" tone="subdued">
          Loading purchase order…
        </Text>
      </AppPage>
    );
  }

  if (!order) {
    return (
      <AppPage
        backAction={{ url: "/dashboard/purchasing/orders" }}
        title="Purchase order"
      >
        <Banner tone="critical">{error ?? "Purchase order not found"}</Banner>
      </AppPage>
    );
  }

  const lines = order.lines ?? [];
  const activities = order.activities ?? [];
  const noteActivities = activities.filter(
    (activity) => activity.activityType === "note",
  );
  const receipts = order.receipts ?? [];
  const canReceive =
    order.state === "confirmed" && order.receiptStatus !== "received";
  const canCancel =
    order.state !== "cancelled" &&
    lines.every((line) => Number(line.qtyReceived) === 0);
  const currencyCode = order.currencyCode ?? "USD";
  const warehouseCount = new Set(
    lines.map((line) => line.warehouseId).filter(Boolean),
  ).size;

  return (
    <AppPage
      backAction={{
        content: "Purchase orders",
        url: "/dashboard/purchasing/orders",
      }}
      primaryAction={
        canReceive
          ? {
              content: "Receive products",
              onAction: () => setReceiveOpen(true),
            }
          : order.state === "draft"
            ? {
                content: "Confirm PO",
                loading: actionLoading,
                onAction: () =>
                  void runAction(() => confirmPurchaseOrder(order.id)),
              }
            : undefined
      }
      secondaryActions={[
        {
          content: "Preview PDF",
          onAction: () => setPreviewOpen(true),
        },
        ...(order.state !== "cancelled"
          ? [
              {
                content: "Send to vendor",
                onAction: () => setEmailOpen(true),
              },
            ]
          : []),
        ...(canCancel
          ? [
              {
                content: "Cancel PO",
                destructive: true,
                onAction: () => setCancelModalOpen(true),
                loading: actionLoading,
              },
            ]
          : []),
        {
          content: "Add note",
          onAction: () => setNoteModalOpen(true),
        },
        ...(order.state === "cancelled"
          ? [
              {
                content: "Delete",
                destructive: true,
                onAction: () => setDeleteModalOpen(true),
              },
            ]
          : []),
      ]}
      subtitle={`Vendor: ${order.vendorName ?? " "} • ${formatDisplayDate(order.orderDate)}`}
      title={order.number}
    >
      <BlockStack gap="500">
        {order.receiptStatus === "received" ? (
          <Banner tone="success">
            All products received. Stock has been updated   check Inventory for
            on-hand quantities and serials.
          </Banner>
        ) : null}

        {order.state === "draft" ? (
          <Banner tone="info">
            This PO is still a draft. Confirm it when you are ready to receive
            goods from the vendor.
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <PurchaseOrderWorkflowPanel
            actionLoading={actionLoading}
            order={order}
            onAddNote={() => setNoteModalOpen(true)}
            onConfirm={() =>
              void runAction(() => confirmPurchaseOrder(order.id))
            }
            onReceive={() => setReceiveOpen(true)}
          />
        </Card>

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <InlineStack gap="300" blockAlign="center">
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="full"
                        padding="300"
                      >
                        <Building2 aria-hidden size={24} strokeWidth={1.75} />
                      </Box>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h2" variant="headingLg">
                            {order.vendorName ?? "Vendor"}
                          </Text>
                          <StatusBadge
                            variant={purchaseOrderStateVariant(order.state)}
                          >
                            {purchaseOrderStateLabel(order.state)}
                          </StatusBadge>
                          <StatusBadge
                            variant={purchaseReceiptStatusVariant(
                              order.receiptStatus,
                            )}
                          >
                            {purchaseReceiptStatusLabel(order.receiptStatus)}
                          </StatusBadge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          {order.vendorEmail
                            ? `${order.vendorEmail} • `
                            : ""}
                          Created {formatDisplayDate(order.createdAt)}
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    {order.vendorId ? (
                      <Button
                        onClick={() =>
                          router.push(
                            `/dashboard/purchasing/vendors/${order.vendorId}`,
                          )
                        }
                      >
                        View vendor
                      </Button>
                    ) : null}
                  </InlineStack>

                  <Divider />

                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Order date
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatDisplayDate(order.orderDate)}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Expected delivery
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatDisplayDate(order.expectedDate)}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Vendor reference
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {order.vendorReference || " "}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Internal reference
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {order.internalReference || " "}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              </Card>

              <Card padding="0">
                <BlockStack gap="400">
                  <Box padding="400" paddingBlockEnd="0">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">
                          Products to receive
                        </Text>
                        <Text as="p" tone="subdued">
                          {lines.length} line{lines.length === 1 ? "" : "s"} ·{" "}
                          {warehouseCount} warehouse
                          {warehouseCount === 1 ? "" : "s"}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Package aria-hidden size={18} />
                        <Text as="span" tone="subdued" variant="bodySm">
                          Cost × quantity only
                        </Text>
                      </InlineStack>
                    </InlineStack>
                  </Box>

                  {lines.length > 0 ? (
                    <IndexTable
                      headings={[
                        { title: "Product" },
                        { title: "Warehouse" },
                        { title: "Ordered", alignment: "end" },
                        { title: "Received", alignment: "end" },
                        { title: "Remaining", alignment: "end" },
                        { title: "Unit cost", alignment: "end" },
                        { title: "Line total", alignment: "end" },
                      ]}
                      itemCount={lines.length}
                      selectable={false}
                    >
                      {lines.map((line, index) => {
                        const remaining =
                          line.qtyRemaining ??
                          Number(line.quantity) - Number(line.qtyReceived);

                        return (
                          <IndexTable.Row
                            id={line.id}
                            key={line.id}
                            position={index}
                          >
                            <IndexTable.Cell>
                              <BlockStack gap="050">
                                <Text as="span" fontWeight="semibold">
                                  {line.productName ?? line.description}
                                </Text>
                                {line.productSku ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    {line.productSku}
                                  </Text>
                                ) : null}
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" tone="subdued">
                                {line.warehouseName ?? " "}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" alignment="end" numeric>
                                {formatQuantity(line.quantity)}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" alignment="end" numeric>
                                {formatQuantity(line.qtyReceived)}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text
                                as="span"
                                alignment="end"
                                fontWeight={
                                  remaining > 0 ? "semibold" : undefined
                                }
                                numeric
                              >
                                {formatQuantity(remaining)}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" alignment="end" numeric>
                                {formatMoney(line.unitPrice, currencyCode)}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text
                                as="span"
                                alignment="end"
                                fontWeight="semibold"
                                numeric
                              >
                                {formatMoney(line.priceTotal, currencyCode)}
                              </Text>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        );
                      })}
                    </IndexTable>
                  ) : (
                    <Box padding="400" paddingBlockStart="0">
                      <Text as="p" tone="subdued">
                        No product lines on this purchase order.
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Card>

              {receipts.length > 0 ? (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Truck aria-hidden size={18} />
                      <Text as="h2" variant="headingMd">
                        Goods receipts
                      </Text>
                    </InlineStack>
                    {receipts.map((receipt) => (
                      <InlineStack
                        key={receipt.id}
                        align="space-between"
                        blockAlign="center"
                      >
                        <Link
                          url={`/dashboard/purchasing/receipts/${receipt.id}`}
                        >
                          {receipt.number}
                        </Link>
                        <InlineStack gap="200" blockAlign="center">
                          <StatusBadge
                            variant={
                              receipt.state === "done" ? "success" : "neutral"
                            }
                          >
                            {receiptStateLabel(receipt.state)}
                          </StatusBadge>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {formatDisplayDate(receipt.receiptDate)}
                          </Text>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </Card>
              ) : null}

              {(order.notes || noteActivities.length > 0) ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Notes
                    </Text>
                    {order.notes ? (
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          PO notes (from creation)
                        </Text>
                        <Text as="p">{order.notes}</Text>
                      </BlockStack>
                    ) : null}
                    {noteActivities.length > 0 ? (
                      <BlockStack gap="300">
                        {order.notes ? <Divider /> : null}
                        <Text as="span" tone="subdued" variant="bodySm">
                          Comments added on this PO
                        </Text>
                        {noteActivities.map((activity, index) => (
                          <BlockStack key={activity.id} gap="100">
                            <Text as="p">{activity.message}</Text>
                            <Text as="span" tone="subdued" variant="bodySm">
                              {new Date(activity.createdAt).toLocaleString()} ·
                              by {formatActivityActor(activity)}
                            </Text>
                            {index < noteActivities.length - 1 ? (
                              <Divider />
                            ) : null}
                          </BlockStack>
                        ))}
                      </BlockStack>
                    ) : null}
                  </BlockStack>
                </Card>
              ) : null}

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Activity log
                  </Text>
                  {activities.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No activity yet.
                    </Text>
                  ) : (
                    activities.map((activity, index) => (
                      <BlockStack key={activity.id} gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="p">{activity.message}</Text>
                          <StatusBadge
                            variant={activityTypeVariant(activity.activityType)}
                          >
                            {activityTypeLabel(activity.activityType)}
                          </StatusBadge>
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {new Date(activity.createdAt).toLocaleString()} · by{" "}
                          {formatActivityActor(activity)}
                        </Text>
                        {index < activities.length - 1 ? <Divider /> : null}
                      </BlockStack>
                    ))
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    What&apos;s next?
                  </Text>
                  <PurchaseOrderNextSteps order={order} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Order total
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Purchase cost only   no VAT on PO lines.
                    </Text>
                  </BlockStack>

                  <Text as="p" fontWeight="bold" variant="heading2xl">
                    {formatMoney(order.amountTotal, currencyCode)}
                  </Text>

                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Currency
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {currencyCode}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Line items
                      </Text>
                      <Text as="span">{lines.length}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Units ordered
                      </Text>
                      <Text as="span">
                        {formatQuantity(receiptProgress.ordered)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Units received
                      </Text>
                      <Text as="span">
                        {formatQuantity(receiptProgress.received)}
                      </Text>
                    </div>
                  </div>
                </BlockStack>
              </Card>

              {order.state === "confirmed" ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Receiving progress
                    </Text>
                    <ProgressBar
                      progress={receiptProgress.percent}
                      size="small"
                    />
                    <Text as="p" tone="subdued" variant="bodySm">
                      {formatQuantity(receiptProgress.received)} of{" "}
                      {formatQuantity(receiptProgress.ordered)} units received (
                      {receiptProgress.percent}%)
                    </Text>
                    {canReceive ? (
                      <Button
                        fullWidth
                        variant="primary"
                        onClick={() => setReceiveOpen(true)}
                      >
                        Receive products
                      </Button>
                    ) : null}
                  </BlockStack>
                </Card>
              ) : null}

              {order.confirmedAt ? (
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Confirmed
                    </Text>
                    <Text as="span">
                      {new Date(order.confirmedAt).toLocaleString()}
                    </Text>
                  </BlockStack>
                </Card>
              ) : null}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <ReceiveGoodsModal
        open={receiveOpen}
        orderId={order.id}
        onClose={() => setReceiveOpen(false)}
        onSuccess={() => {
          setReceiveOpen(false);
          void load();
        }}
      />

      <Modal
        open={cancelModalOpen}
        title={`Cancel purchase order ${order.number}?`}
        onClose={() => setCancelModalOpen(false)}
        primaryAction={{
          content: "Cancel purchase order",
          destructive: true,
          loading: actionLoading,
          onAction: async () => {
            await runAction(() => cancelPurchaseOrder(order.id));
            setCancelModalOpen(false);
            showSuccess(`Purchase order ${order.number} cancelled.`);
          },
        }}
        secondaryActions={[
          { content: "Keep purchase order", onAction: () => setCancelModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Cancel this purchase order before deleting it. Purchase orders with
            received quantities cannot be cancelled.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteModalOpen}
        title={`Delete cancelled purchase order ${order.number}?`}
        onClose={() => setDeleteModalOpen(false)}
        primaryAction={{
          content: "Delete purchase order",
          destructive: true,
          loading: actionLoading,
          onAction: async () => {
            setActionLoading(true);
            try {
              await deletePurchaseOrder(order.id);
              showSuccess(`Cancelled purchase order ${order.number} deleted.`);
              router.push("/dashboard/purchasing/orders");
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Failed to delete purchase order";
              setError(message);
              showError(message);
              setActionLoading(false);
            }
          },
        }}
        secondaryActions={[
          { content: "Keep purchase order", onAction: () => setDeleteModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This removes the cancelled purchase order from normal lists. Its
            audit history and document number remain recorded.
          </Text>
        </Modal.Section>
      </Modal>

      <SendDocumentEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={`Send purchase order ${order.number}`}
        pdfLabel={`purchase-order-${order.number}.pdf`}
        loading={emailSending}
        documentType="purchase_order"
        recipient={order.vendorEmail ?? ""}
        placeholders={{
          number: order.number,
          customerName: order.vendorName ?? "Vendor",
          companyName: "",
          total: formatMoney(order.amountTotal, order.currencyCode),
        }}
        primaryActionLabel="Send PO email"
        onSend={async (input) => {
          setEmailSending(true);
          try {
            await sendPurchaseOrderEmail(order.id, input);
            setEmailOpen(false);
            showSuccess(`Purchase order emailed to ${input.recipientEmail}.`);
            await load();
          } catch (err) {
            showError(err instanceof Error ? err.message : "Failed to send email");
          } finally {
            setEmailSending(false);
          }
        }}
      />

      <DocumentPreviewModal
        documentType="purchase_order"
        open={previewOpen}
        quotationId={order.id}
        quotationNumber={order.number}
        title="Purchase order PDF preview"
        onClose={() => setPreviewOpen(false)}
      />

      <Modal
        open={noteModalOpen}
        primaryAction={{
          content: "Save note",
          onAction: () =>
            void runAction(async () => {
              const updated = await addPurchaseOrderNote(order.id, noteText);
              setNoteModalOpen(false);
              setNoteText("");
              return updated;
            }),
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setNoteModalOpen(false) },
        ]}
        title="Add note"
        onClose={() => setNoteModalOpen(false)}
      >
        <Modal.Section>
          <TextField
            autoComplete="off"
            label="Note"
            multiline={4}
            value={noteText}
            onChange={setNoteText}
          />
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
