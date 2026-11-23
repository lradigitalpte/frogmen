/**
 * Which permission each dashboard area needs, and readable names for permissions.
 * Mirrors the API's PermissionGuard rules so navigation only offers pages that will work.
 * The API stays the security boundary — this is for usability.
 */

import type { NavItem } from "./navigation";

/** A permission, or a list where any one is enough. */
export type AccessRule = string | readonly string[] | null;

export function allows(permissions: readonly string[], rule: AccessRule) {
  if (!rule) return true;
  const list = typeof rule === "string" ? [rule] : rule;
  return list.some((p) => permissions.includes(p));
}

/** Longest matching prefix wins. */
const ROUTE_ACCESS: Array<[string, AccessRule]> = [
  ["/dashboard/analytics", "sales.read"],
  ["/dashboard/customers", "customers.read"],
  ["/dashboard/customers/new", "customers.write"],
  ["/dashboard/leads", "customers.read"],
  ["/dashboard/calendar", "organization.read"],
  ["/dashboard/marketing", "customers.read"],
  ["/dashboard/alerts", "invoices.read"],
  ["/dashboard/sales", "sales.read"],
  ["/dashboard/sales/quotations/new", "sales.write"],
  ["/dashboard/invoices", "invoices.read"],
  ["/dashboard/invoices/new", "invoices.write"],
  ["/dashboard/accounting", "accounting.read"],
  ["/dashboard/accounting/expense-reimbursements", "expense_claims.review"],
  ["/dashboard/inventory", "inventory.read"],
  ["/dashboard/inventory/update-stock", "inventory.adjust"],
  ["/dashboard/inventory/products", "products.read"],
  ["/dashboard/inventory/product-categories", "products.read"],
  ["/dashboard/inventory/product-tags", "products.read"],
  ["/dashboard/warranty", "warranty.read"],
  ["/dashboard/warranty/new", "warranty.manage"],
  ["/dashboard/purchasing", "purchasing.read"],
  ["/dashboard/purchasing/orders/new", "purchasing.write"],
  ["/dashboard/purchasing/vendors", "vendors.read"],
  ["/dashboard/rov", "rov.read"],
  ["/dashboard/profile/expense-claims", "expense_claims.submit"],
  ["/dashboard/settings/branches", "branches.manage"],
  ["/dashboard/settings/users", "members.manage"],
  ["/dashboard/settings/bank-accounts", "accounting.manage"],
  ["/dashboard/settings/audit-log", "audit.read"],
].sort((a, b) => (b[0] as string).length - (a[0] as string).length) as Array<[string, AccessRule]>;

export function routeRule(pathname: string): AccessRule {
  for (const [prefix, rule] of ROUTE_ACCESS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return rule;
  }
  return null;
}

/** Readable labels, grouped the way people think about the app. */
export const PERMISSION_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Sales & customers",
    items: [
      ["customers.read", "View customers & leads"],
      ["customers.write", "Edit customers, leads & campaigns"],
      ["sales.read", "View quotations & orders"],
      ["sales.write", "Create & send quotations"],
      ["sales.approve", "Confirm quotations, send campaigns"],
    ],
  },
  {
    title: "Invoicing",
    items: [
      ["invoices.read", "View invoices"],
      ["invoices.write", "Create & edit draft invoices"],
      ["invoices.post", "Confirm, cancel & credit invoices"],
      ["payments.record", "Record payments"],
    ],
  },
  {
    title: "Purchasing & stock",
    items: [
      ["vendors.read", "View vendors"],
      ["vendors.write", "Edit vendors"],
      ["purchasing.read", "View purchase orders"],
      ["purchasing.write", "Create purchase orders"],
      ["purchasing.approve", "Confirm purchase orders"],
      ["purchasing.receive", "Validate goods receipts"],
      ["products.read", "View products"],
      ["products.write", "Edit products"],
      ["inventory.read", "View stock"],
      ["inventory.adjust", "Adjust stock & warehouses"],
      ["cost.read", "See cost prices & margins"],
    ],
  },
  {
    title: "Finance",
    items: [
      ["accounting.read", "View accounting reports"],
      ["accounting.manage", "Record expenses & manage accounts"],
      ["expense_claims.submit", "Submit own expense claims"],
      ["expense_claims.review", "Approve expense claims"],
      ["expense_claims.reimburse", "Pay out expense claims"],
    ],
  },
  {
    title: "Operations",
    items: [
      ["warranty.read", "View warranties"],
      ["warranty.manage", "Register & edit warranties"],
      ["rov.read", "View ROV projects"],
      ["rov.manage", "Edit ROV projects & media"],
      ["rov.share", "Share ROV reports"],
    ],
  },
  {
    title: "Administration",
    items: [
      ["settings.manage", "Change company settings"],
      ["branches.manage", "Manage branches"],
      ["members.manage", "Manage users & roles"],
      ["audit.read", "View the audit log"],
    ],
  },
];

export const ROLE_INFO: Record<string, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, in every branch. Can't be removed or changed." },
  admin: { label: "Admin", summary: "Everything, in every branch — including users, branches and settings." },
  manager: {
    label: "Manager",
    summary: "Runs a branch: sales, purchasing, stock and approvals. No company settings or users.",
  },
  accountant: {
    label: "Accountant",
    summary: "Invoices, payments, expenses and reports. Reads sales and purchasing.",
  },
  staff: {
    label: "Staff",
    summary: "Day-to-day work: customers, quotations, draft invoices and purchase orders, ROV. No approvals.",
  },
  viewer: { label: "Viewer", summary: "Read-only access to their branches." },
};

export function roleLabel(role?: string | null) {
  return (role && ROLE_INFO[role]?.label) || "Member";
}

export function permissionLabel(permission: string) {
  for (const g of PERMISSION_GROUPS) {
    const hit = g.items.find(([p]) => p === permission);
    if (hit) return hit[1];
  }
  return permission;
}

/** Main navigation with sections and pages the user can't open removed. */
export function visibleNavItems(items: NavItem[], can: (rule: AccessRule) => boolean): NavItem[] {
  return items.flatMap((item) => {
    const children = item.children?.filter((child) => can(routeRule(child.url)));
    if (item.children && !children?.length) return [];
    if (!item.children && !can(routeRule(item.url))) return [];
    // Point the section at a page the user can open.
    const url = can(routeRule(item.url)) ? item.url : children?.[0]?.url ?? item.url;
    return [{ ...item, url, children }];
  });
}
