import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  createCalendarEventSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventSchema,
  updateCalendarSettingsSchema,
  type CreateCalendarEventInput,
  type ListCalendarEventsQuery,
  type UpdateCalendarEventInput,
  type UpdateCalendarSettingsInput,
} from "@frog1/shared";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CalendarService } from "./calendar.service";
import { CalendarRemindersService } from "./calendar-reminders.service";

@Controller("v1/calendar")
@RequireActiveOrg()
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly remindersService: CalendarRemindersService,
  ) {}

  private orgId(session: UserSession): string {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get("items")
  async listItems(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(listCalendarEventsQuerySchema))
    query: ListCalendarEventsQuery,
  ) {
    return this.calendarService.listItems(this.orgId(session), query);
  }

  @Get("overdue-deliveries")
  async overdueDeliveries(@Session() session: UserSession) {
    return this.calendarService.overdueDeliveries(this.orgId(session));
  }

  @Get("countries")
  listCountries() {
    return this.calendarService.listCountries();
  }

  @Get("settings")
  async getSettings(@Session() session: UserSession) {
    return this.calendarService.getSettings(this.orgId(session));
  }

  @Put("settings")
  async updateSettings(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateCalendarSettingsSchema))
    input: UpdateCalendarSettingsInput,
  ) {
    return this.calendarService.updateSettings(this.orgId(session), input);
  }

  @Post("reminders/send-digest")
  async sendDigestNow(@Session() session: UserSession) {
    return this.remindersService.sendDigestNow(this.orgId(session));
  }

  @Get("events/:id")
  async getEvent(@Session() session: UserSession, @Param("id") id: string) {
    return this.calendarService.getEvent(this.orgId(session), id);
  }

  @Post("events")
  async createEvent(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createCalendarEventSchema))
    input: CreateCalendarEventInput,
  ) {
    return this.calendarService.createEvent(
      this.orgId(session),
      session.user?.id ?? null,
      input,
    );
  }

  @Patch("events/:id")
  async updateEvent(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCalendarEventSchema))
    input: UpdateCalendarEventInput,
  ) {
    return this.calendarService.updateEvent(this.orgId(session), id, input);
  }

  @Delete("events/:id")
  async deleteEvent(@Session() session: UserSession, @Param("id") id: string) {
    return this.calendarService.deleteEvent(this.orgId(session), id);
  }
}
