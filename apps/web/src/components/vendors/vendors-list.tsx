"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { Building2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  archiveVendor,
  listVendors,
  restoreVendor,
} from "@/lib/vendors-api";
import type { Vendor } from "@/types/vendor";
import { useToast } from "@/components/providers/toast-provider";

const tabs = [
  { id: "all", content: "All Vendors" },
  { id: "company", content: "Companies" },
  { id: "individual", content: "Individuals" },
  { id: "archived", content: "Archived" },
] as const;

export function VendorsListPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listVendors({
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
      setVendors(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeTab]);

  async function handleArchive(vendor: Vendor) {
    try {
      if (activeTab === "archived") {
        await restoreVendor(vendor.id);
        showSuccess(`${vendor.name} restored`);
      } else {
        await archiveVendor(vendor.id);
        showSuccess(`${vendor.name} archived`);
      }
      void loadVendors();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const rowMarkup = vendors.map((vendor, index) => (
    <IndexTable.Row id={vendor.id} key={vendor.id} position={index}>
      <IndexTable.Cell>
        <Link url={`/dashboard/purchasing/vendors/${vendor.id}`}>
          <Text as="span" fontWeight="semibold">
            {vendor.name}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge variant={vendor.accountType === "company" ? "info" : "neutral"}>
          {vendor.accountType === "company" ? "Company" : "Individual"}
        </StatusBadge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {vendor.email || vendor.phone || vendor.mobile || " "}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          size="slim"
          variant="plain"
          onClick={() => void handleArchive(vendor)}
        >
          {activeTab === "archived" ? "Restore" : "Archive"}
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      fullWidth
      title="Vendors"
      subtitle="Suppliers and vendors for purchase orders."
      primaryAction={{
        content: "Add vendor",
        url: "/dashboard/purchasing/vendors/new",
      }}
    >
      <BlockStack gap="400">
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard
            icon={<Building2 className="size-5" />}
            label="Total vendors"
            value={String(total)}
            hint="active suppliers"
            loading={loading}
          />
          <KpiCard
            icon={<Users className="size-5" />}
            label="On this page"
            value={String(vendors.length)}
            hint="current list view"
            loading={loading}
          />
        </div>

        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexFilters
            appliedFilters={[]}
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search vendors"
            queryValue={query}
            selected={selectedTab}
            tabs={[...tabs]}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />
          <IndexTable
            emptyState={
              <EmptyState
                action={{
                  content: "Add vendor",
                  onAction: () =>
                    router.push("/dashboard/purchasing/vendors/new"),
                }}
                heading="No vendors found"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>Add suppliers to create purchase orders.</p>
              </EmptyState>
            }
            headings={[
              { title: "Name" },
              { title: "Type" },
              { title: "Contact" },
              { title: "" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "vendor", plural: "vendors" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
