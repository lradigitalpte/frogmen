"use client";

import { ActionList, Badge, Button, Icon, Popover, TopBar } from "@shopify/polaris";
import { CheckIcon, GlobeIcon, NotificationIcon, StoreIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { getOverdueAlertCount } from "@/lib/alerts-api";
import { useTheme } from "@/components/providers/theme-provider";
import { getMe, selectBranch, type SecurityContext } from "@/lib/security-api";
import { listCustomers } from "@/lib/customers-api";
import { productUrl } from "@/lib/product-areas";
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
  const [alertCount, setAlertCount] = useState(0);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchSwitching, setBranchSwitching] = useState(false);

  useEffect(() => {
    getMe().then((result) => setSecurity(result.security)).catch(() => null);
    getOverdueAlertCount()
      .then((result) => setAlertCount(result.count ?? 0))
      .catch(() => null);
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
            href: productUrl(item),
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
    setBranchMenuOpen(false);
    const current = security?.branchScope === "all" ? "all" : security?.activeBranchId ?? "";
    if (value === current) return;
    const mode = value === "all" ? "all" : "single";
    setBranchSwitching(true);
    try {
      await selectBranch({
        mode,
        branchId: mode === "single" ? value : null,
      });
      window.location.reload();
    } catch {
      setBranchSwitching(false);
    }
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
  const firstName = userName.split(" ")[0] || userName;

  const welcomeMarkup = (
    <div className="app-shell-welcome">
      Welcome, <strong>{firstName}</strong>!
    </div>
  );

  const userMenuMarkup = (
    <div className="frogmen-topbar-actions">
      {security && security.branches.length > 0 ? (
        <div className="frogmen-topbar-branch">
          {(() => {
            const allMode = security.branchScope === "all";
            const active = security.branches.find((b) => b.id === security.activeBranchId);
            const label = allMode ? "All branches" : active?.name ?? "Choose branch";
            const canSwitch = security.branches.length > 1 || security.canAccessAllBranches;
            const activator = (
              <Button
                disabled={!canSwitch}
                disclosure={canSwitch ? (branchMenuOpen ? "up" : "down") : undefined}
                icon={allMode ? GlobeIcon : StoreIcon}
                loading={branchSwitching}
                accessibilityLabel={`Active branch: ${label}`}
                onClick={() => setBranchMenuOpen((open) => !open)}
              >
                {label}
              </Button>
            );
            if (!canSwitch) return activator;
            return (
              <Popover
                active={branchMenuOpen}
                activator={activator}
                autofocusTarget="first-node"
                preferredAlignment="right"
                onClose={() => setBranchMenuOpen(false)}
              >
                <div className="frogmen-branch-menu">
                  <ActionList
                    actionRole="menuitem"
                    sections={[
                      ...(security.canAccessAllBranches
                        ? [
                            {
                              title: "View",
                              items: [
                                {
                                  content: "All branches",
                                  helpText: `Combined data from ${security.branches.length} branch${security.branches.length === 1 ? "" : "es"}`,
                                  prefix: <span className="frogmen-branch-menu__icon"><Icon source={GlobeIcon} /></span>,
                                  suffix: allMode ? <span className="frogmen-branch-menu__check"><Icon source={CheckIcon} tone="success" /></span> : undefined,
                                  onAction: () => void handleBranchChange("all"),
                                },
                              ],
                            },
                          ]
                        : []),
                      {
                        title: "Branches",
                        items: [...security.branches]
                          .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name))
                          .map((branch) => {
                            const selected = !allMode && branch.id === security.activeBranchId;
                            return {
                              content: branch.name,
                              helpText: [branch.code, branch.isMain ? "Main branch" : null].filter(Boolean).join(" · ") || undefined,
                              prefix: <span className="frogmen-branch-menu__icon"><Icon source={StoreIcon} /></span>,
                              suffix: selected ? <span className="frogmen-branch-menu__check"><Icon source={CheckIcon} tone="success" /></span> : undefined,
                              onAction: () => void handleBranchChange(branch.id),
                            };
                          }),
                      },
                    ]}
                  />
                </div>
              </Popover>
            );
          })()}
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

      <div className="app-shell-bell">
        <Button
          accessibilityLabel={
            alertCount > 0 ? `${alertCount} overdue alerts` : "Alerts"
          }
          icon={NotificationIcon}
          url="/dashboard/alerts"
          variant="tertiary"
        />
        {alertCount > 0 ? (
          <span className="app-shell-bell__count">
            <Badge size="small" tone="critical">
              {alertCount > 99 ? "99+" : String(alertCount)}
            </Badge>
          </span>
        ) : null}
      </div>

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
        avatar={session?.user?.image ?? undefined}
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
      contextControl={welcomeMarkup}
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
