"use client";

import {
  BlockStack,
  IndexTable,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import {
  invoiceLifecycleLabel,
  invoiceLifecycleVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import {
  getCustomer,
  getCustomerActivity,
  type CustomerActivity,
} from "@/lib/customers-api";
import type { Customer } from "@/types/customer";

interface Props {
  customerId: string;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const TABS = [
  { id: "invoices", content: "Invoices" },
  { id: "quotations", content: "Quotations" },
  { id: "payments", content: "Payments" },
];

export function CustomerTransactionsPage({ customerId }: Props) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activity, setActivity] = useState<CustomerActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [cust, act] = await Promise.all([
          getCustomer(customerId),
          getCustomerActivity(customerId),
        ]);
        setCustomer(cust);
        setActivity(act);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId]);

  const invoices = activity?.invoices ?? [];
  const quotations = activity?.quotations ?? [];
  const payments = activity?.payments ?? [];

  const { selectedResources: selInv, allResourcesSelected: allInv, handleSelectionChange: handleSelInv } =
    useIndexResourceState(invoices.map((r) => ({ id: r.id })));
  const { selectedResources: selQ, allResourcesSelected: allQ, handleSelectionChange: handleSelQ } =
    useIndexResourceState(quotations.map((r) => ({ id: r.id })));
  const { selectedResources: selP, allResourcesSelected: allP, handleSelectionChange: handleSelP } =
    useIndexResourceState(payments.map((r) => ({ id: r.id })));

  if (loading) {
    return (
      <AppPage title="Transactions">
        <Text as="p">Loading…</Text>
      </AppPage>
    );
  }

  if (error || !customer) {
    return (
      <AppPage title="Transactions">
        <Text as="p" tone="critical">{error ?? "Customer not found"}</Text>
      </AppPage>
    );
  }

  const tabCounts = [invoices.length, quotations.length, payments.length];

  return (
    <AppPage
      backAction={{ content: customer.name, url: `/dashboard/customers/${customerId}` }}
      title={`Transactions — ${customer.name}`}
      subtitle="All invoices, quotations and payments linked to this customer"
      primaryAction={{
        content: "+ New Quotation",
        onAction: () => router.push("/dashboard/sales/quotations/new"),
      }}
    >
      <BlockStack gap="400">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(i)}
              className={[
                "px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === i
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.content}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {tabCounts[i]}
              </span>
            </button>
          ))}
        </div>

        {/* Invoices tab */}
        {activeTab === 0 && (
          <IndexSurface>
            {invoices.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No invoices found for {customer.name}.
              </div>
            ) : (
              <IndexTable
                resourceName={{ singular: "invoice", plural: "invoices" }}
                itemCount={invoices.length}
                selectedItemsCount={allInv ? "All" : selInv.length}
                onSelectionChange={handleSelInv}
                headings={[
                  { title: "Invoice #" },
                  { title: "Date" },
                  { title: "Amount", alignment: "end" },
                  { title: "Status" },
                ]}
              >
                {invoices.map((inv, index) => (
                  <IndexTable.Row
                    id={inv.id}
                    key={inv.id}
                    selected={selInv.includes(inv.id)}
                    position={index}
                    onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold" variant="bodySm">
                        {inv.number}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">{inv.date}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell flush>
                      <div className="text-right pr-4">
                        <Text as="span" fontWeight="medium" variant="bodySm">
                          {formatAmount(inv.amount, inv.currencyCode)}
                        </Text>
                      </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <StatusBadge variant={invoiceLifecycleVariant(inv.paymentState as never)}>
                        {invoiceLifecycleLabel(inv.paymentState as never)}
                      </StatusBadge>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </IndexSurface>
        )}

        {/* Quotations tab */}
        {activeTab === 1 && (
          <IndexSurface>
            {quotations.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No quotations found for {customer.name}.
              </div>
            ) : (
              <IndexTable
                resourceName={{ singular: "quotation", plural: "quotations" }}
                itemCount={quotations.length}
                selectedItemsCount={allQ ? "All" : selQ.length}
                onSelectionChange={handleSelQ}
                headings={[
                  { title: "Quotation #" },
                  { title: "Date" },
                  { title: "Amount", alignment: "end" },
                  { title: "Status" },
                ]}
              >
                {quotations.map((q, index) => (
                  <IndexTable.Row
                    id={q.id}
                    key={q.id}
                    selected={selQ.includes(q.id)}
                    position={index}
                    onClick={() => router.push(`/dashboard/sales/quotations/${q.id}`)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold" variant="bodySm">
                        {q.number}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">{q.date}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell flush>
                      <div className="text-right pr-4">
                        <Text as="span" fontWeight="medium" variant="bodySm">
                          {formatAmount(q.amount, q.currencyCode)}
                        </Text>
                      </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span className="capitalize rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {q.state}
                      </span>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </IndexSurface>
        )}

        {/* Payments tab */}
        {activeTab === 2 && (
          <IndexSurface>
            {payments.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No payments recorded for {customer.name}.
              </div>
            ) : (
              <IndexTable
                resourceName={{ singular: "payment", plural: "payments" }}
                itemCount={payments.length}
                selectedItemsCount={allP ? "All" : selP.length}
                onSelectionChange={handleSelP}
                headings={[
                  { title: "Invoice #" },
                  { title: "Date" },
                  { title: "Method" },
                  { title: "Amount", alignment: "end" },
                ]}
              >
                {payments.map((p, index) => (
                  <IndexTable.Row
                    id={p.id}
                    key={p.id}
                    selected={selP.includes(p.id)}
                    position={index}
                    onClick={() => router.push(`/dashboard/invoices/${p.invoiceId}`)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold" variant="bodySm">
                        {p.invoiceNumber}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">{p.date}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span className="capitalize text-sm text-muted-foreground">
                        {p.method?.replaceAll("_", " ") ?? "—"}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell flush>
                      <div className="text-right pr-4">
                        <Text as="span" fontWeight="medium" variant="bodySm">
                          {formatAmount(p.amount, p.currencyCode)}
                        </Text>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </IndexSurface>
        )}
      </BlockStack>
    </AppPage>
  );
}
