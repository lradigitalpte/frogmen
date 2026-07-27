export const ROLES = [
  "owner",
  "admin",
  "manager",
  "accountant",
  "staff",
  "viewer",
] as const;

export type AppRole = (typeof ROLES)[number];

export const PERMISSIONS = [
  "organization.read",
  "organization.manage",
  "branches.manage",
  "members.manage",
  "settings.manage",
  "customers.read",
  "customers.write",
  "vendors.read",
  "vendors.write",
  "products.read",
  "products.write",
  "sales.read",
  "sales.write",
  "sales.approve",
  "invoices.read",
  "invoices.write",
  "invoices.post",
  "payments.record",
  "purchasing.read",
  "purchasing.write",
  "purchasing.approve",
  "purchasing.receive",
  "inventory.read",
  "inventory.adjust",
  "accounting.read",
  "accounting.manage",
  "warranty.read",
  "warranty.manage",
  "rov.read",
  "rov.manage",
  "rov.share",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const allPermissions = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  owner: allPermissions,
  admin: allPermissions,
  manager: [
    "organization.read",
    "customers.read",
    "customers.write",
    "vendors.read",
    "vendors.write",
    "products.read",
    "products.write",
    "sales.read",
    "sales.write",
    "sales.approve",
    "invoices.read",
    "invoices.write",
    "invoices.post",
    "payments.record",
    "purchasing.read",
    "purchasing.write",
    "purchasing.approve",
    "purchasing.receive",
    "inventory.read",
    "inventory.adjust",
    "accounting.read",
    "warranty.read",
    "warranty.manage",
    "rov.read",
    "rov.manage",
    "rov.share",
  ],
  accountant: [
    "organization.read",
    "customers.read",
    "vendors.read",
    "products.read",
    "sales.read",
    "invoices.read",
    "invoices.write",
    "invoices.post",
    "payments.record",
    "purchasing.read",
    "inventory.read",
    "accounting.read",
    "accounting.manage",
    "warranty.read",
    "rov.read",
    "audit.read",
  ],
  staff: [
    "organization.read",
    "customers.read",
    "customers.write",
    "vendors.read",
    "products.read",
    "sales.read",
    "sales.write",
    "invoices.read",
    "invoices.write",
    "purchasing.read",
    "purchasing.write",
    "inventory.read",
    "warranty.read",
    "rov.read",
    "rov.manage",
  ],
  viewer: [
    "organization.read",
    "customers.read",
    "vendors.read",
    "products.read",
    "sales.read",
    "invoices.read",
    "purchasing.read",
    "inventory.read",
    "accounting.read",
    "warranty.read",
    "rov.read",
  ],
};

export function normalizeRole(role: string | null | undefined): AppRole {
  return ROLES.includes(role as AppRole) ? (role as AppRole) : "staff";
}

export function permissionsForRole(role: AppRole) {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: AppRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
