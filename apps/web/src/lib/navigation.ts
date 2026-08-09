export type NavIcon =
  | "HomeIcon"
  | "PersonIcon"
  | "OrderIcon"
  | "InventoryIcon"
  | "CartIcon"
  | "CalculatorIcon"
  | "ShieldCheckMarkIcon"
  | "PackageIcon"
  | "SettingsIcon"
  | "SearchIcon";

export interface NavChildLink {
  label: string;
  url: string;
  disabled?: boolean;
  badge?: string;
}

export interface NavItem {
  label: string;
  url: string;
  icon: NavIcon;
  disabled?: boolean;
  badge?: string;
  children?: NavChildLink[];
}

export const mainNavItems: NavItem[] = [
  {
    label: "Home",
    url: "/dashboard",
    icon: "HomeIcon",
  },
  {
    label: "Contacts",
    url: "/dashboard/customers",
    icon: "PersonIcon",
  },
  {
    label: "Sales & Finance",
    url: "/dashboard/alerts",
    icon: "CartIcon",
    children: [
      {
        label: "Alerts",
        url: "/dashboard/alerts",
      },
      {
        label: "Quotations",
        url: "/dashboard/sales/quotations",
      },
      {
        label: "Sales Orders",
        url: "/dashboard/sales/orders",
      },
      {
        label: "Invoices",
        url: "/dashboard/invoices",
      },
    ],
  },
  {
    label: "Accounting",
    url: "/dashboard/accounting",
    icon: "CalculatorIcon",
    children: [
      {
        label: "Profit & Loss",
        url: "/dashboard/accounting/profit-loss",
      },
      {
        label: "Balance Sheet",
        url: "/dashboard/accounting/balance-sheet",
      },
      {
        label: "Expenses",
        url: "/dashboard/accounting/expenses",
      },
      {
        label: "Expense reimbursements",
        url: "/dashboard/accounting/expense-reimbursements",
      },
      {
        label: "Chart of Accounts",
        url: "/dashboard/accounting/chart-of-accounts",
      },
    ],
  },
  {
    label: "Inventory",
    url: "/dashboard/inventory",
    icon: "InventoryIcon",
    children: [
      {
        label: "Stock overview",
        url: "/dashboard/inventory",
      },
      {
        label: "Update stock",
        url: "/dashboard/inventory/update-stock",
      },
      {
        label: "Products",
        url: "/dashboard/inventory/products",
      },
      {
        label: "Warehouses",
        url: "/dashboard/inventory/warehouses",
      },
    ],
  },
  {
    label: "Warranty",
    url: "/dashboard/warranty",
    icon: "ShieldCheckMarkIcon",
    children: [
      {
        label: "Active warranties",
        url: "/dashboard/warranty",
      },
      {
        label: "Policies",
        url: "/dashboard/warranty/policies",
      },
      {
        label: "Register warranty",
        url: "/dashboard/warranty/new",
      },
    ],
  },
  {
    label: "Purchasing",
    url: "/dashboard/purchasing/orders",
    icon: "PackageIcon",
    children: [
      {
        label: "Purchase Orders",
        url: "/dashboard/purchasing/orders",
      },
      {
        label: "Vendors",
        url: "/dashboard/purchasing/vendors",
      },
      {
        label: "Receipts",
        url: "/dashboard/purchasing/receipts",
      },
    ],
  },
];

export const settingsNavLink = {
  label: "Settings",
  url: "/dashboard/settings",
  icon: "SettingsIcon" as const,
};

export const rovNavLink = {
  label: "ROV Inspection",
  url: "/dashboard/rov",
  icon: "SearchIcon" as const,
};

export const profileNavLink = {
  label: "Profile",
  url: "/dashboard/profile",
  icon: "PersonIcon" as const,
};

export type NavLink = NavChildLink & { icon: NavIcon };
export type NavSection = { title?: string; items: NavLink[] };
