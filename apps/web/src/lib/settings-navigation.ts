export interface SettingsNavItem {
  label: string;
  href?: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
  permission?: string;
}

export interface SettingsNavGroup {
  title: string;
  items: SettingsNavItem[];
}

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    title: "Organization",
    items: [
      {
        label: "Company setup",
        href: "/dashboard/settings/company",
        description: "Name, logo, address, default warehouse",
      },
      {
        label: "Branches",
        href: "/dashboard/settings/branches",
        permission: "branches.manage",
        description: "Business branches and document prefixes",
      },
      {
        label: "Users & roles",
        href: "/dashboard/settings/users",
        permission: "members.manage",
        description: "Invite team members and manage access",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        label: "Currencies",
        href: "/dashboard/settings/currencies",
        description: "Base currency and exchange rates",
      },
      {
        label: "Bank accounts",
        href: "/dashboard/settings/bank-accounts",
        permission: "accounting.manage",
        description: "Receiving accounts for payments and GL tracking",
      },
      {
        label: "Taxes & pricing",
        href: "/dashboard/settings/sales-pricing",
        description: "VAT rates and customer price rules",
      },
    ],
  },
  {
    title: "Sales & documents",
    items: [
      {
        label: "Invoice & documents",
        href: "/dashboard/settings/documents",
        description: "Payment details, terms, email, and PDF setup",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Audit log",
        href: "/dashboard/settings/audit-log",
        permission: "audit.read",
        description: "Track changes across the organization",
      },
    ],
  },
];
