import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { map } from "rxjs";
import { hideCosts } from "./hide-costs";
import { hasPermission } from "./permissions";
import type { SecurityContext } from "./security-context";

/** Removes product costs from every response for roles without cost.read. */
@Injectable()
export class CostVisibilityInterceptor implements NestInterceptor {
  intercept(executionContext: ExecutionContext, next: CallHandler) {
    const { securityContext } = executionContext
      .switchToHttp()
      .getRequest<Request & { securityContext?: SecurityContext }>();

    if (!securityContext || hasPermission(securityContext.role, "cost.read")) {
      return next.handle();
    }
    return next.handle().pipe(map(hideCosts));
  }
}
