import {
  Controller,
  Get,
  Headers,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { createHash, timingSafeEqual } from "node:crypto";
import { CalendarRemindersService } from "./calendar-reminders.service";

function sameSecret(given: string, expected: string) {
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Endpoint for an external scheduler (e.g. cron-job.org) so calendar reminders
 * go out even when the API host sleeps between requests. Protected by the
 * CRON_SECRET env var, passed as `?token=`, `x-cron-secret` or a Bearer token.
 */
@Controller("v1/public/cron")
@AllowAnonymous()
export class CalendarCronController {
  constructor(
    private readonly reminders: CalendarRemindersService,
    private readonly config: ConfigService,
  ) {}

  @Get("calendar-reminders")
  runViaGet(
    @Query("token") token?: string,
    @Headers("x-cron-secret") headerSecret?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.run(token, headerSecret, authorization);
  }

  @Post("calendar-reminders")
  runViaPost(
    @Query("token") token?: string,
    @Headers("x-cron-secret") headerSecret?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.run(token, headerSecret, authorization);
  }

  private async run(
    token: string | undefined,
    headerSecret: string | undefined,
    authorization: string | undefined,
  ) {
    const expected = this.config.get<string>("CRON_SECRET")?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        "CRON_SECRET is not configured on the API",
      );
    }

    const bearer = authorization?.replace(/^Bearer\s+/i, "");
    const given = (token ?? headerSecret ?? bearer ?? "").trim();
    if (!given || !sameSecret(given, expected)) {
      throw new UnauthorizedException("Invalid cron token");
    }

    return this.reminders.runDueReminders();
  }
}
