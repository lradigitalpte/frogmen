"use client";

import {
  Banner,
  BlockStack,
  FormLayout,
  Modal,
  Select,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { VendorPicker } from "@/components/purchasing/vendor-picker";
import { useToast } from "@/components/providers/toast-provider";
import {
  CALENDAR_CATEGORY_OPTIONS,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
  type CalendarEventCategory,
} from "@/lib/calendar-api";
import { getCustomer } from "@/lib/customers-api";
import { getVendor } from "@/lib/vendors-api";
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

interface FormState {
  title: string;
  category: CalendarEventCategory;
  startDate: string;
  endDate: string;
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
    startTime: "",
    endTime: "",
    description: "",
    reminderDaysBefore: "1",
    reminderEmails: "",
  };
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
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

  async function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.startDate) {
      setError("Start date is required");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      category: form.category,
      startDate: form.startDate,
      endDate: form.endDate || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      description: form.description.trim() || null,
      customerId: customer?.id ?? null,
      vendorId: vendor?.id ?? null,
      reminderDaysBefore:
        form.reminderDaysBefore === "" ? null : Number(form.reminderDaysBefore),
      reminderEmails: form.reminderEmails.trim() || null,
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

  return (
    <Modal
      loading={loading}
      open={open}
      primaryAction={{
        content: eventId ? "Save event" : "Create event",
        loading: saving,
        disabled: loading || deleting,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[
        ...(eventId
          ? [
              {
                content: "Delete",
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
        <BlockStack gap="400">
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}
          <FormLayout>
            <TextField
              autoComplete="off"
              label="Title"
              placeholder="e.g. Site visit with client"
              requiredIndicator
              value={form.title}
              onChange={(value) => update("title", value)}
            />
            <Select
              label="Category"
              options={CALENDAR_CATEGORY_OPTIONS}
              value={form.category}
              onChange={(value) => update("category", value as CalendarEventCategory)}
            />
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                label="Start date"
                requiredIndicator
                type="date"
                value={form.startDate}
                onChange={(value) => update("startDate", value)}
              />
              <TextField
                autoComplete="off"
                helpText="Optional, for multi-day events"
                label="End date"
                type="date"
                value={form.endDate}
                onChange={(value) => update("endDate", value)}
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                helpText="Leave blank for all day"
                label="Start time"
                type="time"
                value={form.startTime}
                onChange={(value) => update("startTime", value)}
              />
              <TextField
                autoComplete="off"
                label="End time"
                type="time"
                value={form.endTime}
                onChange={(value) => update("endTime", value)}
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <CustomerPicker
                allowClear
                label="Related customer"
                value={customer}
                onChange={setCustomer}
              />
              <VendorPicker value={vendor} onChange={setVendor} />
            </FormLayout.Group>
            <TextField
              autoComplete="off"
              label="Notes"
              multiline={3}
              value={form.description}
              onChange={(value) => update("description", value)}
            />
            <FormLayout.Group>
              <Select
                label="Email reminder"
                options={REMINDER_OPTIONS}
                value={form.reminderDaysBefore}
                onChange={(value) => update("reminderDaysBefore", value)}
              />
              <TextField
                autoComplete="off"
                disabled={form.reminderDaysBefore === ""}
                helpText="Comma separated. Leave blank to use the calendar's default recipients."
                label="Send reminder to"
                placeholder="e.g. ops@company.com"
                value={form.reminderEmails}
                onChange={(value) => update("reminderEmails", value)}
              />
            </FormLayout.Group>
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
