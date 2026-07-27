"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { Building2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveCustomer,
  getCustomerStats,
  listCustomers,
  restoreCustomer,
} from "@/lib/customers-api";
import type { Customer, CustomerStats, CustomerTab } from "@/types/customer";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { useToast } from "@/components/providers/toast-provider";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";

const tabs: { id: CustomerTab; content: string }[] = [
  { id: "all", content: "All Customers" },
  { id: "company", content: "Companies" },
  { id: "individual", content: "Individuals" },
  { id: "archived", content: "Archived" },
];

function contactLine(customer: Customer) {
  return customer.email || customer.phone || customer.mobile || " ";
}

function customerSubtitle(customer: Customer) {
  if (customer.accountType === "company") {
    return customer.reference || "Corporate Account";
  }

  return customer.jobTitle || "Individual";
}

function accountTypeBadge(customer: Customer) {
  if (customer.accountType === "company") {
    return <StatusBadge variant="info">Company</StatusBadge>;
  }

  return <StatusBadge variant="neutral">Individual</StatusBadge>;
}

export function CustomersListPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listCustomers({
        page,
        perPage: 16,
        search: debouncedQuery || undefined,
        archived: activeTab === "archived",
        accountType:
          activeTab === "individual" || activeTab === "company"
            ? activeTab
            : undefined,
        sortBy: "name",
        sortDir: "asc",
      });

      setCustomers(result.data);
      setTotal(result.meta.total);

      try {
        const statsResult = await getCustomerStats();
        setStats(statsResult);
      } catch (statsErr) {
        setStats(null);
        showError(
          statsErr instanceof Error
            ? statsErr.message
            : "Could not load customer statistics",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load customers";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page, showError]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedQuery]);

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  async function handleArchive(id: string, name: string) {
    try {
      if (activeTab === "archived") {
        await restoreCustomer(id);
        showSuccess(`${name} restored`);
      } else {
        await archiveCustomer(id);
        showSuccess(`${name} archived`);
      }

      await loadCustomers();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Could not update customer",
      );
    }
  }

  const rowMarkup = customers.map((customer, index) => (
    <IndexTable.Row id={customer.id} key={customer.id} position={index}>
      <IndexTable.Cell>
        <InlineStack blockAlign="center" gap="300" wrap={false}>
          <CustomerAvatar
            avatarPath={customer.avatarPath}
            name={customer.name}
            size="md"
          />
          <BlockStack gap="050">
            <Link dataPrimaryLink url={`/dashboard/customers/${customer.id}`}>
              <Text as="span" fontWeight="semibold">
                {customer.name}
              </Text>
            </Link>
            <Text as="span" tone="subdued" variant="bodySm">
              {customerSubtitle(customer)}
            </Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {accountTypeBadge(customer)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm">{contactLine(customer)}</Text>
          {customer.phone && customer.email && (
            <Text as="span" tone="subdued" variant="bodySm">{customer.phone}</Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            url={`/dashboard/customers/${customer.id}`}
            variant="primary"
          >
            View Profile
          </Button>
          <Button
            size="slim"
            url={`/dashboard/customers/${customer.id}/edit`}
          >
            Edit
          </Button>
          <Button
            size="slim"
            tone={activeTab === "archived" ? "success" : "critical"}
            onClick={() => void handleArchive(customer.id, customer.name)}
          >
            {activeTab === "archived" ? "Restore" : "Archive"}
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "Create contact",
          onAction: () => router.push("/dashboard/customers/new"),
        }}
        heading="Create your first customer"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>Add individuals and companies you work with.</p>
      </EmptyState>
    ),
    [router],
  );

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{
        content: "+ Create Contact",
        onAction: () => router.push("/dashboard/customers/new"),
      }}
      subtitle="Directory of corporate accounts, master divers, and commercial clients."
      title="Customer Directory"
    >
      <BlockStack gap="400">
        {/* Customer metrics */}
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            icon={<Users className="size-5" />}
            label="Total Customers"
            value={`${stats?.totalAccounts ?? total} accounts`}
            hint="registered accounts"
            tone="default"
            loading={loading && !stats}
            footer={
              <p className="text-sm text-muted-foreground">
                {stats && stats.registeredThisMonth > 0 ? (
                  <>
                    <span className="font-medium text-frogmen-emerald-dark">
                      +{stats.registeredThisMonth} registered
                    </span>{" "}
                    this month
                  </>
                ) : (
                  "No new accounts this month"
                )}
              </p>
            }
          />
          <KpiCard
            icon={<Building2 className="size-5" />}
            label="Corporate Accounts"
            value={`${stats?.corporateAccounts ?? 0} companies`}
            hint="Active B2B partners"
            tone="default"
            loading={loading && !stats}
          />
        </div>

        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search customers by name, company, email, or phone..."
            queryValue={query}
            selected={selectedTab}
            tabs={tabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Customer / Company" },
              { title: "Account Type" },
              { title: "Contact Details" },
              { title: "Actions" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={resourceName}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
