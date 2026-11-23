import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { hasPermission, type Permission } from "./permissions";
import { PERMISSION_METADATA } from "./require-permission.decorator";
import { SecurityContextService } from "./security-context.service";

type SessionRequest = Request & {
  session?: {
    user: { id: string };
    session: {
      id: string;
      activeOrganizationId?: string | null;
      activeBranchId?: string | null;
      branchScope?: string | null;
    };
  } | null;
  securityContext?: Awaited<ReturnType<SecurityContextService["resolve"]>>;
};

/** A permission, a list where any one is enough, or null for "signed-in member is enough". */
export type PermissionRule = Permission | readonly Permission[] | null;

interface RouteInfo {
  write: boolean;
  /** Path segments after /api/v1/, e.g. ["invoices", "<id>", "confirm"]. */
  segments: string[];
  /** Last segment when it is a word (not an id), e.g. "confirm". */
  action: string | null;
}

/** State changes that need the stronger "approve / post / receive" permission. */
const ELEVATED_ACTIONS = new Set(["confirm", "approve", "validate", "post", "reset", "cancel"]);

/** Everyone except read-only viewers. */
const ANY_EDITOR: readonly Permission[] = [
  "sales.write",
  "customers.write",
  "invoices.write",
  "purchasing.write",
  "accounting.manage",
  "rov.manage",
  "warranty.manage",
];

const rw = (read: PermissionRule, write: PermissionRule) => (r: RouteInfo) => (r.write ? write : read);

/**
 * Permission rules for routes without an explicit @RequirePermission, keyed by the first path
 * segment after /api/v1/. Matching is on whole segments — never substrings — so "/members" is not
 * treated as "/me" and "/media" is not skipped.
 */
const RESOURCE_RULES: Record<string, (r: RouteInfo) => PermissionRule> = {
  branches: rw("organization.read", "branches.manage"),
  members: () => "members.manage",
  "audit-logs": () => "audit.read",
  settings: rw("organization.read", "settings.manage"),
  currencies: rw("organization.read", "settings.manage"),
  files: () => "organization.read",

  customers: rw("customers.read", "customers.write"),
  leads: rw("customers.read", "customers.write"),
  "email-marketing": (r) =>
    !r.write
      ? "customers.read"
      : r.action === "send" || r.action === "test-send"
        ? ["sales.approve", "settings.manage"] // mass email goes out under the company name
        : "customers.write",
  calendar: rw("organization.read", ANY_EDITOR),

  vendors: rw("vendors.read", "vendors.write"),
  products: rw("products.read", "products.write"),
  "product-categories": rw("products.read", "products.write"),
  "product-tags": rw("products.read", "products.write"),

  warehouses: rw("inventory.read", "inventory.adjust"),
  stock: rw("inventory.read", "inventory.adjust"),
  // Serial-numbered product units; linking one to a sale is part of selling it.
  units: rw("products.read", ["products.write", "inventory.adjust", "sales.write"]),

  "purchase-orders": (r) =>
    !r.write ? "purchasing.read" : r.action && ELEVATED_ACTIONS.has(r.action) ? "purchasing.approve" : "purchasing.write",
  "goods-receipts": (r) =>
    !r.write ? "purchasing.read" : r.action === "validate" ? "purchasing.receive" : "purchasing.write",

  quotations: (r) =>
    !r.write ? "sales.read" : r.action && ELEVATED_ACTIONS.has(r.action) ? "sales.approve" : "sales.write",
  "quotation-followups": rw("sales.read", "sales.write"),
  "delivery-notes": rw("sales.read", "sales.write"),
  analytics: () => "sales.read",
  alerts: (r) =>
    !r.write
      ? "invoices.read"
      : r.segments[1] === "resend-reminder"
        ? "invoices.write"
        : "settings.manage", // automation rules and job runs

  invoices: (r) => {
    if (!r.write) return "invoices.read";
    if (r.action === "pay") return "payments.record";
    if (r.action && ELEVATED_ACTIONS.has(r.action)) return "invoices.post";
    return "invoices.write";
  },
  "credit-notes": rw("invoices.read", "invoices.post"),
  payments: rw("invoices.read", "payments.record"),

  accounting: rw("accounting.read", "accounting.manage"),
  expenses: rw("accounting.read", "accounting.manage"),
  "expense-payment-sources": rw("accounting.read", "accounting.manage"),
  // Staff filing an expense claim need the category list; invoice screens need bank accounts.
  "expense-categories": rw(["accounting.read", "expense_claims.submit"], "accounting.manage"),
  "bank-accounts": rw(["accounting.read", "invoices.write", "payments.record"], "accounting.manage"),
  // Each route declares its own permission; GET /:id is checked per claim in the service.
  "expense-claims": () => null,

  warranties: rw("warranty.read", "warranty.manage"),
  "warranty-policies": rw("warranty.read", "warranty.manage"),

  rov: (r) => (r.segments.includes("share-link") ? "rov.share" : r.write ? "rov.manage" : "rov.read"),
};

/** Routes that need no organization permission (own account, platform admin, public links). */
const OPEN_RESOURCES = new Set(["me", "platform", "public", "health"]);

const UUID_OR_ID = /^[0-9a-f-]{8,}$|^\d+$/i;

export function routeInfo(method: string, path: string): RouteInfo {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const clean = path.toLowerCase().split("?")[0]!.replace(/\/+$/, "");
  const segments = clean.replace(/^\/?api\/v1\/?/, "").replace(/^\/?v1\/?/, "").split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? null;
  const action = segments.length > 1 && last && !UUID_OR_ID.test(last) ? last : null;
  return { write, segments, action };
}

/** The permission enforced for a route that has no explicit @RequirePermission. */
export function inferPermission(method: string, path: string): PermissionRule | "deny" {
  const info = routeInfo(method, path);
  const resource = info.segments[0];
  if (!resource || OPEN_RESOURCES.has(resource)) return null;
  const rule = RESOURCE_RULES[resource];
  if (rule) return rule(info);
  // Unknown resource: reads need membership, writes are refused until a rule is added.
  return info.write ? "deny" : "organization.read";
}

export function satisfies(role: Parameters<typeof hasPermission>[0], rule: PermissionRule) {
  if (!rule) return true;
  const list = typeof rule === "string" ? [rule] : rule;
  return list.some((permission) => hasPermission(role, permission));
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly contexts: SecurityContextService,
  ) {}

  async canActivate(executionContext: ExecutionContext) {
    const request = executionContext.switchToHttp().getRequest<SessionRequest>();
    const session = request.session;
    const organizationId = session?.session.activeOrganizationId;

    if (!session || !organizationId) {
      return true;
    }

    // Cross-tenant platform admin routes use RAW_DATABASE + PlatformAdminGuard.
    const info = routeInfo(request.method, request.path);
    if (info.segments[0] === "platform") {
      return true;
    }

    const context = await this.contexts.resolve({
      sessionId: session.session.id,
      userId: session.user.id,
      organizationId,
      activeBranchId: session.session.activeBranchId,
      branchScope: session.session.branchScope,
    });
    request.securityContext = context;

    const explicit = this.reflector.getAllAndOverride<Permission | Permission[] | undefined>(PERMISSION_METADATA, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    const required = explicit ?? inferPermission(request.method, request.path);

    if (required === "deny") {
      throw new ForbiddenException("This action isn't available for your role");
    }
    if (!satisfies(context.role, required)) {
      const names = typeof required === "string" ? required : required?.join(" or ");
      throw new ForbiddenException(`Missing permission: ${names}`);
    }

    const isSeedDefault = info.action === "seed-default";
    if (
      info.write &&
      !isSeedDefault &&
      context.branchScope === "all" &&
      !(info.segments[0] === "branches" && info.action === "select")
    ) {
      throw new ForbiddenException("Select a specific branch before making changes");
    }

    return true;
  }
}
