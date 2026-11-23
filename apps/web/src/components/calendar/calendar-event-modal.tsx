"use client";

import {
  Banner,
  Checkbox,
  FormLayout,
  type IconSource,
  Icon,
  Modal,
  Select,
  TextField,
} from "@shopify/polaris";
import {
  CalendarIcon,
  ChatIcon,
  ClockIcon,
  EmailIcon,
  FlagIcon,
  LinkIcon,
  MenuHorizontalIcon,
  NoteIcon,
  NotificationIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { useEffect, useState, type ReactNode } from "react";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { VendorPicker } from "@/components/purchasing/vendor-picker";
import { useToast } from "@/components/providers/toast-provider";
import {
  CALENDAR_CATEGORY_OPTIONS,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  parseIsoDate,
  toIsoDate,
  updateCalendarEvent,
  type CalendarEventCategory,
} from "@/lib/calendar-api";
import { getCustomer } from "@/lib/customers-api";
import { getVendor } from "@/lib/vendors-api";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import type { Vendor } from "@/types/vendor";

const REMINDER_OPTIONS = [
  { label: "No email reminder", value: "" },
  { label: "On the day", value: "0" },
  { label: "1 day before", value: "1" },
  { label: "2 days before", value: "2" },
  { label: "3 days before", value: "3" },
  { label: "1 week before", value: "7" },
  { label: "2 weeks before", value: "14" },
  { label: "1 month before", value: "30" },
];

const CATEGORY_META: Record<CalendarEventCategory, { icon: IconSource; short: string; color: string }> = {
  meeting: { icon: PersonIcon, short: "Meeting", color: "#3b6ef5" },
  reminder: { icon: NotificationIcon, short: "Reminder", color: "#e09400" },
  deadline: { icon: FlagIcon, short: "Deadline", color: "#d93636" },
  follow_up: { icon: ChatIcon, short: "Follow-up", color: "#1f9d55" },
  holiday: { icon: CalendarIcon, short: "Closure", color: "#8b5cf6" },
  other: { icon: MenuHorizontalIcon, short: "Other", color: "#7a7a7a" },
};

interface FormState {
  title: string;
  category: CalendarEventCategory;
  startDate: string;
  endDate: string;
  multiDay: boolean;
  allDay: boolean;
  startTime: string;
  endTime: string;
  description: string;
  reminderDaysBefore: string;
  reminderEmails: string;
}

function emptyForm(date: string): FormState {
  return {
    title: "",
    category: "meeting",
    startDate: date,
    endDate: "",
    multiDay: false,
    allDay: true,
    startTime: "",
    endTime: "",
    description: "",
    reminderDaysBefore: "1",
    reminderEmails: "",
  };
}

function addDaysIso(iso: string, days: number) {
  const date = parseIsoDate(iso);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

function addHour(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function shortDate(iso: string) {
  if (!iso) return "";
  return parseIsoDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One-line plain-English summary of when the event happens. */
function whenSummary(form: FormState) {
  if (!form.startDate) return "Pick a date";
  const days =
    form.multiDay && form.endDate && form.endDate > form.startDate
      ? `${shortDate(form.startDate)} → ${shortDate(form.endDate)}`
      : shortDate(form.startDate);
  if (form.allDay || !form.startTime) return `${days} · All day`;
  return `${days} · ${form.startTime}${form.endTime ? `–${form.endTime}` : ""}`;
}

function validate(form: FormState): string | null {
  if (!form.title.trim()) return "Give the event a title.";
  if (!form.startDate) return "Choose a start date.";
  if (form.multiDay && form.endDate && form.endDate < form.startDate) {
    return "The end date is before the start date.";
  }
  if (!form.allDay) {
    if (!form.startTime) return "Add a start time, or switch on All day.";
    if (form.endTime && !form.multiDay && form.endTime <= form.startTime) {
      return "The end time must be after the start time.";
    }
  }
  return null;
}

function FormBlock({
  icon,
  title,
  aside,
  children,
}: {
  icon: IconSource;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cev-block">
      <header className="cev-block__head">
        <span className="cev-block__icon">
          <Icon source={icon} />
        </span>
        <h3>{title}</h3>
        {aside ? <span className="cev-block__aside">{aside}</span> : null}
      </header>
      <div className="cev-block__body">{children}</div>
    </section>
  );
}

interface CalendarEventModalProps {
  open: boolean;
  eventId: string | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CalendarEventModal({
  open,
  eventId,
  defaultDate,
  onClose,
  onSaved,
}: CalendarEventModalProps) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setTouched(false);
    setConfirmDelete(false);
    setCustomer(null);
    setVendor(null);

    if (!eventId) {
      setForm(emptyForm(defaultDate));
      return;
    }

    setLoading(true);
    getCalendarEvent(eventId)
      .then(async (event) => {
        setForm({
          title: event.title,
          category: event.category,
          startDate: event.startDate,
          endDate: event.endDate ?? "",
          multiDay: Boolean(event.endDate && event.endDate > event.startDate),
          allDay: !event.startTime,
          startTime: event.startTime ?? "",
          endTime: event.endTime ?? "",
          description: event.description ?? "",
          reminderDaysBefore:
            event.reminderDaysBefore === null ? "" : String(event.reminderDaysBefore),
          reminderEmails: event.reminderEmails ?? "",
        });
        const [linkedCustomer, linkedVendor] = await Promise.all([
          event.customerId ? getCustomer(event.customerId).catch(() => null) : null,
          event.vendorId ? getVendor(event.vendorId).catch(() => null) : null,
        ]);
        setCustomer(linkedCustomer);
        setVendor(linkedVendor);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load event"),
      )
      .finally(() => setLoading(false));
  }, [open, eventId, defaultDate]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleAllDay(allDay: boolean) {
    setForm((current) => ({
      ...current,
      allDay,
      startTime: allDay ? "" : current.startTime || "09:00",
      endTime: allDay ? "" : current.endTime || addHour(current.startTime || "09:00"),
    }));
  }

  function toggleMultiDay(multiDay: boolean) {
    setForm((current) => ({
      ...current,
      multiDay,
      endDate: multiDay ? current.endDate || addDaysIso(current.startDate, 1) : "",
    }));
  }

  function changeStartDate(value: string) {
    setForm((current) => ({
      ...current,
      startDate: value,
      // Keep the end date after the start date when the start moves later.
      endDate: current.multiDay && current.endDate && value > current.endDate ? value : current.endDate,
    }));
  }

  function changeStartTime(value: string) {
    setForm((current) => ({
      ...current,
      startTime: value,
      endTime: !current.endTime || current.endTime <= value ? (value ? addHour(value) : "") : current.endTime,
    }));
  }

  const validation = validate(form);
  const titleError = touched && !form.title.trim() ? "Title is required" : undefined;

  async function handleSave() {
    setTouched(true);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      category: form.category,
      startDate: form.startDate,
      endDate: form.multiDay && form.endDate ? form.endDate : null,
      startTime: form.allDay ? null : form.startTime || null,
      endTime: form.allDay ? null : form.endTime || null,
      description: form.description.trim() || null,
      customerId: customer?.id ?? null,
      vendorId: vendor?.id ?? null,
      reminderDaysBefore:
        form.reminderDaysBefore === "" ? null : Number(form.reminderDaysBefore),
      reminderEmails:
        form.reminderDaysBefore === "" ? null : form.reminderEmails.trim() || null,
    };

    try {
      if (eventId) {
        await updateCalendarEvent(eventId, payload);
        showSuccess("Event updated");
      } else {
        await createCalendarEvent(payload);
        showSuccess("Event created");
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save event";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!eventId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteCalendarEvent(eventId);
      showSuccess("Event deleted");
      onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  }

  const meta = CATEGORY_META[form.category];
  const reminderOn = form.reminderDaysBefore !== "";

  return (
    <Modal
      loading={loading}
      open={open}
      primaryAction={{
        content: saving ? "Saving…" : eventId ? "Save changes" : "Create event",
        loading: saving,
        disabled: loading || deleting,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[
        ...(eventId
          ? [
              {
                content: confirmDelete ? "Click again to delete" : "Delete",
                destructive: true,
                loading: deleting,
                disabled: saving,
                onAction: () => void handleDelete(),
              },
            ]
          : []),
        { content: "Cancel", onAction: onClose },
      ]}
      title={eventId ? "Edit event" : "New event"}
      onClose={onClose}
    >
      <Modal.Section>
        <div className="cev" style={{ ["--cev-color" as string]: meta.color }}>
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          {/* Title + live summary */}
          <div className="cev-hero">
            <span className="cev-hero__icon">
              <Icon source={meta.icon} />
            </span>
            <div className="cev-hero__body">
              <TextField
                autoComplete="off"
                autoFocus={!eventId}
                error={titleError}
                label="Title"
                labelHidden
                placeholder="What's happening? e.g. Site visit with client"
                value={form.title}
                onChange={(value) => update("title", value)}
              />
              <span className="cev-hero__when">
                <Icon source={ClockIcon} tone="subdued" />
                {whenSummary(form)}
              </span>
            </div>
          </div>

          {/* Category */}
          <div className="cev-cats" role="radiogroup" aria-label="Category">
            {CALENDAR_CATEGORY_OPTIONS.map((option) => {
              const value = option.value as CalendarEventCategory;
              const item = CATEGORY_META[value];
              const active = form.category === value;
              return (
                <button
                  aria-checked={active}
                  className={cn("cev-cat", active && "is-active")}
                  key={value}
                  role="radio"
                  style={{ ["--cat-color" as string]: item.color }}
                  title={option.label}
                  type="button"
                  onClick={() => update("category", value)}
                >
                  <Icon source={item.icon} />
                  {item.short}
                </button>
              );
            })}
          </div>

          <FormBlock icon={CalendarIcon} title="When">
            <FormLayout>
              <FormLayout.Group condensed>
                <TextField
                  autoComplete="off"
                  label={form.multiDay ? "Starts" : "Date"}
                  type="date"
                  value={form.startDate}
                  onChange={changeStartDate}
                />
                {form.multiDay ? (
                  <TextField
                    autoComplete="off"
                    error={
                      form.endDate && form.endDate < form.startDate ? "Before start date" : undefined
                    }
                    label="Ends"
                    min={form.startDate}
                    type="date"
                    value={form.endDate}
                    onChange={(value) => update("endDate", value)}
                  />
                ) : null}
              </FormLayout.Group>
              {!form.allDay ? (
                <FormLayout.Group condensed>
                  <TextField
                    autoComplete="off"
                    label="From"
                    type="time"
                    value={form.startTime}
                    onChange={changeStartTime}
                  />
                  <TextField
                    autoComplete="off"
                    error={
                      !form.multiDay && form.endTime && form.startTime && form.endTime <= form.startTime
                        ? "Must be after start"
                        : undefined
                    }
                    label="To"
                    type="time"
                    value={form.endTime}
                    onChange={(value) => update("endTime", value)}
                  />
                </FormLayout.Group>
              ) : null}
              <div className="cev-toggles">
                <Checkbox checked={form.allDay} label="All day" onChange={toggleAllDay} />
                <Checkbox checked={form.multiDay} label="Spans several days" onChange={toggleMultiDay} />
              </div>
            </FormLayout>
          </FormBlock>

          <FormBlock icon={LinkIcon} title="Linked to" aside="Optional">
            <FormLayout>
              <FormLayout.Group>
                <CustomerPicker allowClear label="Customer" value={customer} onChange={setCustomer} />
                <VendorPicker value={vendor} onChange={setVendor} />
              </FormLayout.Group>
            </FormLayout>
          </FormBlock>

          <FormBlock icon={NoteIcon} title="Notes" aside="Optional">
            <TextField
              autoComplete="off"
              label="Notes"
              labelHidden
              multiline={3}
              placeholder="Agenda, address, dial-in details…"
              value={form.description}
              onChange={(value) => update("description", value)}
            />
          </FormBlock>

          <FormBlock
            icon={EmailIcon}
            title="Email reminder"
            aside={reminderOn ? undefined : "Off"}
          >
            <FormLayout>
              <Select
                label="Remind"
                labelHidden
                options={REMINDER_OPTIONS}
                value={form.reminderDaysBefore}
                onChange={(value) => update("reminderDaysBefore", value)}
              />
              {reminderOn ? (
                <TextField
                  autoComplete="email"
                  helpText="Separate addresses with commas. Leave blank to use the recipients from Calendar settings."
                  label="Send to"
                  placeholder="ops@company.com, sales@company.com"
                  value={form.reminderEmails}
                  onChange={(value) => update("reminderEmails", value)}
                />
              ) : null}
            </FormLayout>
          </FormBlock>
        </div>
      </Modal.Section>
    </Modal>
  );
}
