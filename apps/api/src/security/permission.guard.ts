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

    const context = await this.contexts.resolve({
      sessionId: session.session.id,
      userId: session.user.id,
      organizationId,
      activeBranchId: session.session.activeBranchId,
      branchScope: session.session.branchScope,
    });
    request.securityContext = context;

    const explicit = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_METADATA,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    const required = explicit ?? this.inferPermission(request);

    if (required && !hasPermission(context.role, required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (
      isWrite &&
      context.branchScope === "all" &&
      !request.path.endsWith("/branches/select")
    ) {
      throw new ForbiddenException(
        "Select a specific branch before making changes",
      );
    }

    return true;
  }

  private inferPermission(request: Request): Permission | null {
    const path = request.path.toLowerCase();
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const elevated = /(confirm|approve|validate|post|reset|cancel)/.test(path);

    if (path.includes("/me")) return null;
    if (path.includes("/branches")) return write ? "branches.manage" : "organization.read";
    if (path.includes("/members") || path.includes("/invitations")) return "members.manage";
    if (path.includes("/audit")) return "audit.read";
    if (path.includes("/settings") || path.includes("/currencies"))
      return write ? "settings.manage" : "organization.read";
    if (path.includes("/customers")) return write ? "customers.write" : "customers.read";
    if (path.includes("/vendors")) return write ? "vendors.write" : "vendors.read";
    if (path.includes("/products") || path.includes("/product-"))
      return write ? "products.write" : "products.read";
    if (path.includes("/warehouses") || path.includes("/stock"))
      return write ? "inventory.adjust" : "inventory.read";
    if (path.includes("/purchase") || path.includes("/goods-receipts"))
      return elevated
        ? path.includes("receipt") || path.includes("validate")
          ? "purchasing.receive"
          : "purchasing.approve"
        : write
          ? "purchasing.write"
          : "purchasing.read";
    if (path.includes("/invoices"))
      return path.includes("/pay")
        ? "payments.record"
        : elevated
          ? "invoices.post"
          : write
            ? "invoices.write"
            : "invoices.read";
    if (path.includes("/quotations") || path.includes("/sales"))
      return elevated
        ? "sales.approve"
        : write
          ? "sales.write"
          : "sales.read";
    if (path.includes("/accounting"))
      return write ? "accounting.manage" : "accounting.read";
    if (path.includes("/warrant")) return write ? "warranty.manage" : "warranty.read";
    if (path.includes("/rov"))
      return path.includes("share-link")
        ? "rov.share"
        : write
          ? "rov.manage"
          : "rov.read";
    return null;
  }
}
