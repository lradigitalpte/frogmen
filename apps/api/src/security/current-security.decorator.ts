import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { SecurityContext } from "./security-context";

export const CurrentSecurity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SecurityContext =>
    context.switchToHttp().getRequest().securityContext,
);
