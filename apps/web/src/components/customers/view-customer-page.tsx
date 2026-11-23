"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  Icon,
  IndexTable,
  InlineStack,
  Modal,
  SkeletonBodyText,
  SkeletonDisplayText,
  Tabs,
  Text,
} from "@shopify/polaris";
import {
  CalendarIcon,
  CreditCardIcon,
  EmailIcon,
  GlobeIcon,
  HashtagIcon,
  IdentityCardIcon,
  LocationIcon,
  PersonIcon,
  PhoneIcon,
} from "@shopify/polaris-icons";
import { formatPostalAddressLines } from "@frog1/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import {
  customerSinceLabel,
  customerSubtitle,
  documentStatusLabel,
  documentStatusTone,
  locationLine,
  titleCase,
} from "@/components/customers/customer-format";
import { MultiCurrencyAmount } from "@/components/customers/multi-currency-amount";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  archiveCustomer,
  getCustomer,
  getCustomerActivity,
  type CustomerActivity,
} from "@/lib/customers-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";

interface ViewCustomerPageProps {
  id?: string;
  customerId?: string;
}

type ActivityTab = "quotations" | "invoices" | "payments";

interface ActivityRow {
  id: string;
  number: string;
  date: string;
  status: string;
  detail?: string;
  amount: number;
  currencyCode: string;
  url: string;
}

function dateLabel(value: string) {
  return formatAppDate(value.slice(0, 10)) || value;
}

export function ViewCustomerPage({ id, customerId }: ViewCustomerPageProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const { baseCurrencyCode } = useOrgCurrency();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activity, setActivity] = useState<CustomerActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [tab, setTab] = useState(0);

  const activeId = customerId || id || "";

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getCustomer(activeId), getCustomerActivity(activeId).catch(() => null)])
      .then(([data, customerActivity]) => {
        if (cancelled) return;
        setCustomer(data);
        setActivity(customerActivity);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load customer");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const rows = useMemo<Record<ActivityTab, ActivityRow[]>>(() => {
    const byDate = (a: ActivityRow, b: ActivityRow) => b.date.localeCompare(a.date);
    return {
      quotations: (activity?.quotations ?? [])
        .map((q) => ({
          id: q.id,
          number: q.number,
          date: q.date,
          status: q.state,
          amount: q.amount,
          currencyCode: q.currencyCode,
          url: `/dashboard/sales/quotations/${q.id}`,
        }))
        .sort(byDate),
      invoices: (activity?.invoices ?? [])
        .map((inv) => ({
          id: inv.id,
          number: inv.number,
          date: inv.date,
          status: inv.paymentState === "paid" ? "paid" : inv.paymentState || inv.state,
          amount: inv.amount,
          currencyCode: inv.currencyCode,
          url: `/dashboard/invoices/${inv.id}`,
        }))
        .sort(byDate),
      payments: (activity?.payments ?? [])
        .map((p) => ({
          id: p.id,
          number: p.invoiceNumber,
          date: p.date,
          status: "paid",
          detail: p.method ? documentStatusLabel(p.method) : "Payment",
          amount: p.amount,
          currencyCode: p.currencyCode,
          url: `/dashboard/invoices/${p.invoiceId}`,
        }))
        .sort(byDate),
    };
  }, [activity]);

  if (loading) {
    return (
      <AppPage title="Customer" backAction={{ content: "Customers", url: "/dashboard/customers" }}>
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="300">
              <SkeletonDisplayText size="large" />
              <SkeletonBodyText lines={2} />
            </BlockStack>
          </Card>
          <Card>
            <SkeletonBodyText lines={6} />
          </Card>
        </BlockStack>
      </AppPage>
    );
  }

  if (error || !customer) {
    return (
      <AppPage title="Customer" backAction={{ content: "Customers", url: "/dashboard/customers" }}>
        <Banner tone="critical" title="Customer could not be loaded">
          <p>{error || "This customer does not exist or was removed."}</p>
        </Banner>
      </AppPage>
    );
  }

  const name = titleCase(customer.name);
  const isCompany = customer.accountType === "company";
  const phone = customer.phone || customer.mobile;
  const since = customerSinceLabel(customer);
  const address = formatPostalAddressLines({
    street1: customer.street1,
    street2: customer.street2,
    city: customer.city ? titleCase(customer.city) : customer.city,
    stateCode: customer.stateCode,
    zip: customer.zip,
    countryCode: customer.countryCode,
  });
  const credit = Number(customer.creditLimit) || 0;

  const fallbackCurrency = activity?.invoices[0]?.currencyCode ?? baseCurrencyCode;
  const unpaidInvoices = (activity?.invoices ?? []).filter((inv) => inv.paymentState !== "paid");
  const openQuotes = (activity?.quotations ?? []).filter((q) =>
    ["draft", "sent", "signed"].includes(q.state),
  );

  const tabs: { id: ActivityTab; content: string }[] = [
    { id: "quotations", content: `Quotations (${rows.quotations.length})` },
    { id: "invoices", content: `Invoices (${rows.invoices.length})` },
    { id: "payments", content: `Payments (${rows.payments.length})` },
  ];
  const activeTab = tabs[tab].id;
  const activeRows = rows[activeTab];

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveCustomer(customer!.id);
      showSuccess(`${name} archived`);
      router.push("/dashboard/customers");
      router.refresh();
    } catch (archiveError) {
      showError(archiveError instanceof Error ? archiveError.message : "Could not archive customer");
      setArchiving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Customers", url: "/dashboard/customers" }}
      title={name}
      titleMetadata={
        customer.isActive ? undefined : <Badge tone="critical">Archived</Badge>
      }
      subtitle={`${isCompany ? "Company" : "Individual"}${since ? ` · Customer since ${dateLabel(since)}` : ""}`}
      primaryAction={{ content: "Edit customer", url: `/dashboard/customers/${activeId}/edit` }}
      secondaryActions={[
        { content: "New quotation", url: "/dashboard/sales/quotations/new" },
        { content: "All transactions", url: `/dashboard/customers/${activeId}/transactions` },
        { content: "Archive", onAction: () => setArchiveOpen(true) },
      ]}
    >
      <div className="cprof-layout">
        <div className="cprof-main">
          {/* Hero */}
          <section className="cprof-hero">
            <div className="cprof-hero__identity">
              <CustomerAvatar avatarPath={customer.avatarPath} name={customer.name} size="xl" />
              <div>
                <h2>{name}</h2>
                <p>{customerSubtitle(customer)}</p>
                <div className="cprof-hero__chips">
                  <span className="cdir-type on-dark">{isCompany ? "Company" : "Individual"}</span>
                  {locationLine(customer) ? <span className="cprof-chip">{locationLine(customer)}</span> : null}
                </div>
              </div>
            </div>
            <div className="cprof-hero__actions">
              <Button icon={EmailIcon} url={customer.email ? `mailto:${customer.email}` : undefined} disabled={!customer.email}>
                Email
              </Button>
              <Button icon={PhoneIcon} url={phone ? `tel:${phone}` : undefined} disabled={!phone}>
                Call
              </Button>
            </div>

            <div className="cprof-hero__stats">
              <div>
                <span>Invoiced</span>
                <strong><MultiCurrencyAmount items={activity?.invoices ?? []} fallbackCurrency={fallbackCurrency} /></strong>
                <small>{rows.invoices.length} invoice{rows.invoices.length === 1 ? "" : "s"}</small>
              </div>
              <div>
                <span>Paid</span>
                <strong><MultiCurrencyAmount items={activity?.payments ?? []} fallbackCurrency={fallbackCurrency} /></strong>
                <small>{rows.payments.length} payment{rows.payments.length === 1 ? "" : "s"}</small>
              </div>
              <div>
                <span>Unpaid invoices</span>
                <strong className={unpaidInvoices.length ? "is-alert" : undefined}>
                  <MultiCurrencyAmount items={unpaidInvoices} fallbackCurrency={fallbackCurrency} />
                </strong>
                <small>{unpaidInvoices.length} open</small>
              </div>
              <div>
                <span>Open quotations</span>
                <strong><MultiCurrencyAmount items={openQuotes} fallbackCurrency={fallbackCurrency} /></strong>
                <small>{openQuotes.length} in progress</small>
              </div>
            </div>
          </section>

          {/* Activity tables */}
          <Card padding="0">
            <div className="cprof-activity-head">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Sales activity</Text>
                <Text as="p" tone="subdued" variant="bodySm">Quotations, invoices and payments for {name}</Text>
              </BlockStack>
              <Button variant="plain" url={`/dashboard/customers/${activeId}/transactions`}>
                View all transactions
              </Button>
            </div>
            <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
            <IndexTable
              resourceName={{ singular: activeTab.slice(0, -1), plural: activeTab }}
              itemCount={activeRows.length}
              selectable={false}
              emptyState={
                <EmptyState
                  heading={`No ${activeTab} yet`}
                  image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                  action={
                    activeTab === "quotations"
                      ? { content: "New quotation", url: "/dashboard/sales/quotations/new" }
                      : undefined
                  }
                >
                  <p>They will show up here as soon as they are created.</p>
                </EmptyState>
              }
              headings={[
                { title: activeTab === "payments" ? "Invoice" : "Number" },
                { title: "Date" },
                { title: activeTab === "payments" ? "Method" : "Status" },
                { title: "Amount", alignment: "end" },
              ]}
            >
              {activeRows.map((row, index) => (
                <IndexTable.Row
                  id={row.id}
                  key={row.id}
                  position={index}
                  onClick={() => router.push(row.url)}
                >
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{row.number}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">{dateLabel(row.date)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {row.detail ? (
                      <Text as="span">{row.detail}</Text>
                    ) : (
                      <Badge tone={documentStatusTone(row.status)}>{documentStatusLabel(row.status)}</Badge>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" alignment="end" fontWeight="semibold" numeric>
                      {formatAlertMoney(row.amount, row.currencyCode || fallbackCurrency)}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </div>

        {/* Side column */}
        <aside className="cprof-side">
          <InfoCard title="Contact">
            <InfoRow icon={EmailIcon} label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
            <InfoRow icon={PhoneIcon} label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
            {customer.mobile && customer.mobile !== customer.phone ? (
              <InfoRow icon={PhoneIcon} label="Mobile" value={customer.mobile} href={`tel:${customer.mobile}`} />
            ) : null}
            <InfoRow
              icon={GlobeIcon}
              label="Website"
              value={customer.website}
              href={customer.website ? (customer.website.startsWith("http") ? customer.website : `https://${customer.website}`) : undefined}
            />
            <InfoRow icon={PersonIcon} label="Job title" value={customer.jobTitle} />
          </InfoCard>

          <InfoCard title="Address">
            <InfoRow icon={LocationIcon} label="Billing address" value={address.length ? address.join("\n") : null} multiline />
          </InfoCard>

          <InfoCard title="Account">
            <InfoRow icon={IdentityCardIcon} label="Tax ID / VAT" value={customer.taxId} />
            <InfoRow icon={HashtagIcon} label="Reference" value={customer.reference} />
            <InfoRow
              icon={CreditCardIcon}
              label="Credit line"
              value={credit > 0 ? formatAlertMoney(credit, baseCurrencyCode) : "None"}
              badge={credit > 0 ? (customer.creditApproved ? { tone: "success", label: "Approved" } : { tone: "attention", label: "Pending" }) : undefined}
            />
            <InfoRow icon={CalendarIcon} label="Customer since" value={since ? dateLabel(since) : null} />
            <InfoRow icon={HashtagIcon} label="Account ID" value={customer.id.slice(0, 8).toUpperCase()} />
          </InfoCard>
        </aside>
      </div>

      <Modal
        open={archiveOpen}
        title={`Archive ${name}?`}
        onClose={() => setArchiveOpen(false)}
        primaryAction={{
          content: "Archive customer",
          destructive: true,
          loading: archiving,
          onAction: () => void handleArchive(),
        }}
        secondaryActions={[{ content: "Cancel", disabled: archiving, onAction: () => setArchiveOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">This customer will be removed from active customer lists.</Text>
            <Text as="p" tone="subdued">
              Quotations, invoices, payments and audit history are kept. You can restore the customer
              later from the Archived tab.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingSm">{title}</Text>
        <dl className="cdir-details">{children}</dl>
      </BlockStack>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
  multiline,
  badge,
}: {
  icon: typeof EmailIcon;
  label: string;
  value: string | null | undefined;
  href?: string;
  multiline?: boolean;
  badge?: { tone: "success" | "attention"; label: string };
}) {
  return (
    <div className={cn("cdir-details__row", "cprof-info-row")}>
      <dt>
        <Icon source={icon} tone="subdued" />
        {label}
      </dt>
      <dd className={cn(!value && "is-empty", multiline && "is-multiline")}>
        {value ? (
          href ? (
            <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          "—"
        )}
        {badge ? (
          <>
            {" "}
            <Badge size="small" tone={badge.tone}>{badge.label}</Badge>
          </>
        ) : null}
      </dd>
    </div>
  );
}
