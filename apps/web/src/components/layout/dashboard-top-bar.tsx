"use client";

import { Select, TopBar } from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useTheme } from "@/components/providers/theme-provider";
import { getMe, selectBranch, type SecurityContext } from "@/lib/security-api";
import { listCustomers } from "@/lib/customers-api";
import { listProducts } from "@/lib/products-api";
import { listInvoices } from "@/lib/invoices-api";
import { listQuotations } from "@/lib/quotations-api";
import { listPurchaseOrders } from "@/lib/purchase-orders-api";

interface GlobalSearchResult {
  id: string;
  type: "Customer" | "Product" | "Invoice" | "Quotation" | "Purchase order";
  title: string;
  detail: string;
  href: string;
}

interface DashboardTopBarProps {
  onNavigationToggle: () => void;
  showNavigationToggle?: boolean;
}

export function DashboardTopBar({
  onNavigationToggle,
  showNavigationToggle = true,
}: DashboardTopBarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [userMenuActive, setUserMenuActive] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [security, setSecurity] = useState<SecurityContext | null>(null);
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((result) => setSecurity(result.security)).catch(() => null);
  }, []);

  useEffect(() => {
    const query = searchValue.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);

      void Promise.allSettled([
        listCustomers({ search: query, page: 1, perPage: 4 }),
        listProducts({ search: query, page: 1, perPage: 4 }),
        listInvoices({ search: query, perPage: 4 }),
        listQuotations({ search: query, page: 1, perPage: 4 }),
        listPurchaseOrders({ search: query, page: 1, perPage: 4 }),
      ]).then((responses) => {
        if (cancelled) return;

        const next: GlobalSearchResult[] = [];
        const [customers, products, invoices, quotations, purchaseOrders] = responses;

        if (customers.status === "fulfilled") {
          next.push(...customers.value.data.map((item) => ({
            id: item.id,
            type: "Customer" as const,
            title: item.name,
            detail: item.email || item.phone || "Customer account",
            href: `/dashboard/customers/${item.id}`,
          })));
        }
        if (products.status === "fulfilled") {
          next.push(...products.value.data.map((item) => ({
            id: item.id,
            type: "Product" as const,
            title: item.name,
            detail: item.sku || item.barcode || "Inventory product",
            href: `/dashboard/inventory/products/${item.id}`,
          })));
        }
        if (invoices.status === "fulfilled") {
          next.push(...invoices.value.map((item) => ({
            id: item.id,
            type: "Invoice" as const,
            title: item.number,
            detail: `${item.customerName} • ${item.status}`,
            href: `/dashboard/invoices/${item.id}`,
          })));
        }
        if (quotations.status === "fulfilled") {
          next.push(...quotations.value.data.map((item) => ({
            id: item.id,
            type: "Quotation" as const,
            title: item.number,
            detail: `${item.customerName || "Customer"} • ${item.state}`,
            href: `/dashboard/sales/quotations/${item.id}`,
          })));
        }
        if (purchaseOrders.status === "fulfilled") {
          next.push(...purchaseOrders.value.data.map((item) => ({
            id: item.id,
            type: "Purchase order" as const,
            title: item.number,
            detail: `${item.vendorName || "Vendor"} • ${item.state}`,
            href: `/dashboard/purchasing/orders/${item.id}`,
          })));
        }

        setSearchResults(next);
        setSearchError(
          responses.every((response) => response.status === "rejected")
            ? "Search is temporarily unavailable."
            : null,
        );
        setSearchLoading(false);
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchValue]);

  async function handleBranchChange(value: string) {
    const mode = value === "all" ? "all" : "single";
    await selectBranch({
      mode,
      branchId: mode === "single" ? value : null,
    });
    const result = await getMe();
    setSecurity(result.security);
    window.location.reload();
  }

  const toggleUserMenu = useCallback(
    () => setUserMenuActive((active) => !active),
    [],
  );

  const toggleSearch = useCallback(
    () => setSearchActive((active) => !active),
    [],
  );

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Ignore auth errors during standalone testing
    }
    window.location.href = "/login";
  }

  const userName = session?.user?.name ?? "admin";
  const userEmail = session?.user?.email ?? "admin@gmail.com";
  const isDark = theme === "dark";

  const userMenuMarkup = (
    <div className="frogmen-topbar-actions">
      {security ? (
        <div className="frogmen-topbar-branch">
          <Select
            label="Active branch"
            labelHidden
            options={[
              ...(security.canAccessAllBranches
                ? [{ label: "All branches", value: "all" }]
                : []),
              ...security.branches.map((branch) => ({
                label: branch.name,
                value: branch.id,
              })),
            ]}
            value={
              security.branchScope === "all"
                ? "all"
                : security.activeBranchId ?? ""
            }
            onChange={handleBranchChange}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="frogmen-topbar-theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
      </button>

      <TopBar.UserMenu
        actions={[
          {
            items: [
              {
                content: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
                onAction: toggleTheme,
              },
              {
                content: "Switch Organization",
                onAction: () => router.push("/select-organization"),
              },
              {
                content: "Sign out",
                onAction: handleSignOut,
              },
            ],
          },
        ]}
        detail={userEmail}
        initials={userName.slice(0, 2).toUpperCase()}
        name={userName}
        open={userMenuActive}
        onToggle={toggleUserMenu}
      />
    </div>
  );

  const searchMarkup = (
    <TopBar.SearchField
      focused={searchActive}
      onBlur={() => setSearchActive(false)}
      onChange={setSearchValue}
      onFocus={() => setSearchActive(true)}
      value={searchValue}
      placeholder="Search orders, stock, collections, customers..."
    />
  );

  const searchResultsMarkup = (
    <div className="frogmen-global-search" role="listbox" aria-label="Global search results">
      {searchValue.trim().length < 2 ? (
        <p>Enter at least 2 characters.</p>
      ) : searchLoading ? (
        <p>Searching your workspace...</p>
      ) : searchError ? (
        <p>{searchError}</p>
      ) : searchResults.length === 0 ? (
        <p>No matching customers, products, documents, or orders.</p>
      ) : (
        searchResults.map((result) => (
          <button
            key={`${result.type}-${result.id}`}
            type="button"
            role="option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSearchActive(false);
              setSearchValue("");
              router.push(result.href);
            }}
          >
            <span className="frogmen-global-search__type">{result.type}</span>
            <span className="frogmen-global-search__copy">
              <strong>{result.title}</strong>
              <small>{result.detail}</small>
            </span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <TopBar
      searchField={searchMarkup}
      searchResults={searchResultsMarkup}
      searchResultsVisible={searchActive && searchValue.length > 0}
      searchResultsOverlayVisible
      showNavigationToggle={showNavigationToggle}
      userMenu={userMenuMarkup}
      onNavigationToggle={onNavigationToggle}
      onSearchResultsDismiss={toggleSearch}
    />
  );
}
