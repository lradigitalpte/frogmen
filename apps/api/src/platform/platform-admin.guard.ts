import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { isPlatformAdminEmail } from "./platform-admin";

type SessionRequest = Request & {
  session?: {
    user: { id: string; email?: string | null };
  } | null;
};

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(executionContext: ExecutionContext) {
    const request = executionContext.switchToHttp().getRequest<SessionRequest>();
    const session = request.session;

    if (!session?.user) {
      throw new UnauthorizedException("Authentication required");
    }

    if (!isPlatformAdminEmail(session.user.email, this.config)) {
      throw new ForbiddenException("Platform admin access required");
    }

    return true;
  }
}
