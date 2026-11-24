import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { SettingsModule } from "../settings/settings.module";
import { CalendarCronController } from "./calendar-cron.controller";
import { CalendarController } from "./calendar.controller";
import { CalendarRemindersService } from "./calendar-reminders.service";
import { CalendarService } from "./calendar.service";
import { HolidaysService } from "./holidays.service";

@Module({
  imports: [MailModule, SettingsModule],
  controllers: [CalendarController, CalendarCronController],
  providers: [CalendarService, HolidaysService, CalendarRemindersService],
  exports: [CalendarService],
})
export class CalendarModule {}
