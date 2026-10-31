"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Modal,
  SkeletonBodyText,
  Tabs,
  Text,
} from "@shopify/polaris";
import { ChevronLeftIcon, ChevronRightIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  CALENDAR_SOURCE_LABELS,
  calendarStatusBadge,
  getCalendarSettings,
  listCalendarItems,
  listHolidayCountries,
  listOverdueDeliveries,
  parseIsoDate,
  toIsoDate,
  type CalendarItem,
  type CalendarSource,
} from "@/lib/calendar-api";
import { CalendarEventModal } from "./calendar-event-modal";

const SOURCE_ORDER: CalendarSource[] = [
  "event",
  "holiday",
  "purchase_order",
  "goods_receipt",
  "invoice_due",
  "quotation_expiry",
  "warranty_expiry",
  "customer_anniversary",
  "vendor_anniversary",
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FILTER_STORAGE_KEY = "frog1.calendar.sources";
const MAX_CHIPS_PER_DAY = 3;

const VIEW_TABS = [
  { id: "month", content: "Month" },
  { id: "agenda", content: "Agenda" },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday-start 6-week grid covering the month. */
function monthGrid(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function loadStoredSources(): Set<CalendarSource> {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CalendarSource[];
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((source) => SOURCE_ORDER.includes(source)));
      }
    }
  } catch {
    // Storage unavailable — fall back to showing everything.
  }
  return new Set(SOURCE_ORDER);
}

function storeSources(sources: Set<CalendarSource>) {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...sources]));
  } catch {
    // Ignore storage failures; the filter still applies for this session.
  }
}

/** Expand multi-day events so they appear on every day they cover. */
function itemsByDay(items: CalendarItem[]) {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const end = item.endDate && item.endDate > item.date ? item.endDate : item.date;
    let cursor = parseIsoDate(item.date);
    let guard = 0;
    while (toIsoDate(cursor) <= end && guard < 62) {
      const key = toIsoDate(cursor);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }
  return map;
}

function formatLongDate(isoDate: string) {
  return parseIsoDate(isoDate).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeLabel(item: CalendarItem) {
  if (!item.startTime) return null;
  return item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
}

function CalendarChip({
  item,
  onSelect,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
}) {
  const time = timeLabel(item);
  return (
    <button
      className={cn(
        "calendar-chip",
        `calendar-chip--${item.source}`,
        item.status === "overdue" && "calendar-chip--overdue",
      )}
      title={[item.title, item.subtitle].filter(Boolean).join(" — ")}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
    >
      {item.countryCode && item.source === "holiday" ? (
        <span className="calendar-chip__tag">{item.countryCode}</span>
      ) : null}
      {time ? <span className="calendar-chip__time">{time}</span> : null}
      <span className="calendar-chip__label">{item.title}</span>
    </button>
  );
}

function CalendarItemRow({
  item,
  onSelect,
  showDate,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
  showDate?: boolean;
}) {
  const badge = calendarStatusBadge(item.status);
  const time = timeLabel(item);

  return (
    <button className="calendar-row" type="button" onClick={() => onSelect(item)}>
      <span className={cn("calendar-dot", `calendar-dot--${item.source}`)} />
      <span className="calendar-row__body">
        <Text as="span" fontWeight="semibold" variant="bodyMd">
          {item.title}
        </Text>
        <Text as="span" tone="subdued" variant="bodySm">
          {[
            showDate ? formatAppDate(item.date) : null,
            time,
            item.subtitle,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </span>
      {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
    </button>
  );
}

export function CalendarPage() {
  const router = useRouter();
  const today = toIsoDate(new Date());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [viewIndex, setViewIndex] = useState(0);
  const [sources, setSources] = useState<Set<CalendarSource>>(
    () => new Set(SOURCE_ORDER),
  );
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [overdue, setOverdue] = useState<CalendarItem[]>([]);
  const [trackedCountries, setTrackedCountries] = useState<string[]>([]);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    eventId: string | null;
    date: string;
  }>({ open: false, eventId: null, date: today });

  useEffect(() => {
    setSources(loadStoredSources());
  }, []);

  const grid = useMemo(() => monthGrid(month), [month]);
  const rangeFrom = toIsoDate(grid[0]);
  const rangeTo = toIsoDate(grid[grid.length - 1]);
  const sourceList = useMemo(
    () => SOURCE_ORDER.filter((source) => sources.has(source)),
    [sources],
  );

  const loadMonth = useCallback(async () => {
    if (!sourceList.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(
        await listCalendarItems({ from: rangeFrom, to: rangeTo, sources: sourceList }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, sourceList]);

  const loadSidebar = useCallback(async () => {
    try {
      const [nextItems, overdueItems, settings] = await Promise.all([
        listCalendarItems({ from: today, to: toIsoDate(addDays(new Date(), 14)) }),
        listOverdueDeliveries(),
        getCalendarSettings(),
      ]);
      setUpcoming(
        nextItems.filter((item) => item.status !== "done" && item.status !== "paid"),
      );
      setOverdue(overdueItems);
      setTrackedCountries(settings.trackedCountries);
    } catch {
      // The main calendar surfaces load errors; the sidebar stays empty.
    }
  }, [today]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    void loadSidebar();
    listHolidayCountries()
      .then((countries) =>
        setCountryNames(
          Object.fromEntries(countries.map((country) => [country.code, country.name])),
        ),
      )
      .catch(() => undefined);
  }, [loadSidebar]);

  const byDay = useMemo(() => itemsByDay(items), [items]);
  const monthKey = toIsoDate(month).slice(0, 7);
  const agendaDays = useMemo(
    () =>
      [...byDay.entries()]
        .filter(([date]) => date.startsWith(monthKey))
        .sort(([a], [b]) => a.localeCompare(b)),
    [byDay, monthKey],
  );

  function toggleSource(source: CalendarSource, checked: boolean) {
    setSources((current) => {
      const next = new Set(current);
      if (checked) next.add(source);
      else next.delete(source);
      storeSources(next);
      return next;
    });
  }

  function handleSelect(item: CalendarItem) {
    if (item.source === "event" && item.eventId) {
      setSelectedDay(null);
      setEventModal({ open: true, eventId: item.eventId, date: item.date });
      return;
    }
    setSelectedItem(item);
  }

  function openNewEvent(date: string) {
    setSelectedDay(null);
    setEventModal({ open: true, eventId: null, date });
  }

  function handleEventSaved() {
    setEventModal((current) => ({ ...current, open: false }));
    void loadMonth();
    void loadSidebar();
  }

  const monthTitle = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const selectedBadge = selectedItem ? calendarStatusBadge(selectedItem.status) : null;
  const dayItems = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <AppPage
      primaryAction={{ content: "New event", onAction: () => openNewEvent(today) }}
      secondaryActions={[
        {
          content: "Calendar settings",
          onAction: () => router.push("/dashboard/calendar/settings"),
        },
      ]}
      subtitle="Holidays, deliveries, due dates, anniversaries and your team's events in one place."
      title="Calendar"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {error ? (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            ) : null}

            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <InlineStack blockAlign="center" gap="300">
                    <ButtonGroup variant="segmented">
                      <Button
                        accessibilityLabel="Previous month"
                        icon={ChevronLeftIcon}
                        onClick={() =>
                          setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                        }
                      />
                      <Button onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
                      <Button
                        accessibilityLabel="Next month"
                        icon={ChevronRightIcon}
                        onClick={() =>
                          setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                        }
                      />
                    </ButtonGroup>
                    <Text as="h2" variant="headingLg">
                      {monthTitle}
                    </Text>
                  </InlineStack>
                  <Tabs selected={viewIndex} tabs={VIEW_TABS} onSelect={setViewIndex} />
                </InlineStack>
              </Box>
              <Divider />

              {viewIndex === 0 ? (
                <div className={cn("calendar-month", loading && "calendar-month--loading")}>
                  {WEEKDAYS.map((day) => (
                    <div className="calendar-month__weekday" key={day}>
                      {day}
                    </div>
                  ))}
                  {grid.map((day) => {
                    const iso = toIsoDate(day);
                    const dayList = byDay.get(iso) ?? [];
                    const hidden = dayList.length - MAX_CHIPS_PER_DAY;
                    const hasHoliday = dayList.some((item) => item.source === "holiday");
                    return (
                      <div
                        className={cn(
                          "calendar-month__day",
                          day.getMonth() !== month.getMonth() && "calendar-month__day--outside",
                          iso === today && "calendar-month__day--today",
                          hasHoliday && "calendar-month__day--holiday",
                        )}
                        key={iso}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNewEvent(iso)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") openNewEvent(iso);
                        }}
                      >
                        <span className="calendar-month__date">{day.getDate()}</span>
                        <div className="calendar-month__chips">
                          {dayList.slice(0, MAX_CHIPS_PER_DAY).map((item) => (
                            <CalendarChip item={item} key={`${iso}-${item.id}`} onSelect={handleSelect} />
                          ))}
                          {hidden > 0 ? (
                            <button
                              className="calendar-more"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedDay(iso);
                              }}
                            >
                              +{hidden} more
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Box padding="400">
                  {loading ? (
                    <SkeletonBodyText lines={8} />
                  ) : agendaDays.length === 0 ? (
                    <Text as="p" tone="subdued">
                      Nothing scheduled in {monthTitle}.
                    </Text>
                  ) : (
                    <BlockStack gap="400">
                      {agendaDays.map(([date, list]) => (
                        <BlockStack gap="200" key={date}>
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingSm">
                              {formatLongDate(date)}
                            </Text>
                            {date === today ? <Badge tone="attention">Today</Badge> : null}
                          </InlineStack>
                          <BlockStack gap="100">
                            {list.map((item) => (
                              <CalendarItemRow item={item} key={`${date}-${item.id}`} onSelect={handleSelect} />
                            ))}
                          </BlockStack>
                        </BlockStack>
                      ))}
                    </BlockStack>
                  )}
                </Box>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {overdue.length ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Overdue deliveries
                    </Text>
                    <Badge tone="critical">{String(overdue.length)}</Badge>
                  </InlineStack>
                  <BlockStack gap="100">
                    {overdue.slice(0, 6).map((item) => (
                      <CalendarItemRow item={item} key={item.id} showDate onSelect={handleSelect} />
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Coming up (next 14 days)
                </Text>
                {upcoming.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Nothing coming up.
                  </Text>
                ) : (
                  <BlockStack gap="100">
                    {upcoming.slice(0, 10).map((item) => (
                      <CalendarItemRow item={item} key={`up-${item.id}`} showDate onSelect={handleSelect} />
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Show on calendar
                </Text>
                <BlockStack gap="100">
                  {SOURCE_ORDER.map((source) => (
                    <InlineStack blockAlign="center" gap="200" key={source} wrap={false}>
                      <span className={cn("calendar-dot", `calendar-dot--${source}`)} />
                      <Checkbox
                        checked={sources.has(source)}
                        label={CALENDAR_SOURCE_LABELS[source]}
                        onChange={(checked) => toggleSource(source, checked)}
                      />
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Holiday countries
                  </Text>
                  <Button variant="plain" onClick={() => router.push("/dashboard/calendar/settings")}>
                    Manage
                  </Button>
                </InlineStack>
                {trackedCountries.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No countries tracked yet. Add countries to see their public holidays.
                  </Text>
                ) : (
                  <InlineStack gap="200">
                    {trackedCountries.map((code) => (
                      <Badge key={code}>{countryNames[code] ?? code}</Badge>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={selectedItem !== null}
        primaryAction={
          selectedItem?.url
            ? {
                content: "Open record",
                onAction: () => router.push(selectedItem.url!),
              }
            : undefined
        }
        secondaryActions={[{ content: "Close", onAction: () => setSelectedItem(null) }]}
        title={selectedItem?.title ?? ""}
        onClose={() => setSelectedItem(null)}
      >
        {selectedItem ? (
          <Modal.Section>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <span className={cn("calendar-dot", `calendar-dot--${selectedItem.source}`)} />
                <Text as="span" tone="subdued">
                  {CALENDAR_SOURCE_LABELS[selectedItem.source]}
                </Text>
                {selectedBadge ? (
                  <Badge tone={selectedBadge.tone}>{selectedBadge.label}</Badge>
                ) : null}
              </InlineStack>
              <Text as="p" variant="headingSm">
                {formatLongDate(selectedItem.date)}
              </Text>
              {selectedItem.subtitle ? <Text as="p">{selectedItem.subtitle}</Text> : null}
            </BlockStack>
          </Modal.Section>
        ) : null}
      </Modal>

      <Modal
        open={selectedDay !== null}
        primaryAction={
          selectedDay
            ? { content: "Add event", onAction: () => openNewEvent(selectedDay) }
            : undefined
        }
        secondaryActions={[{ content: "Close", onAction: () => setSelectedDay(null) }]}
        title={selectedDay ? formatLongDate(selectedDay) : ""}
        onClose={() => setSelectedDay(null)}
      >
        <Modal.Section>
          <BlockStack gap="100">
            {dayItems.map((item) => (
              <CalendarItemRow
                item={item}
                key={`day-${item.id}`}
                onSelect={(next) => {
                  setSelectedDay(null);
                  handleSelect(next);
                }}
              />
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <CalendarEventModal
        defaultDate={eventModal.date}
        eventId={eventModal.eventId}
        open={eventModal.open}
        onClose={() => setEventModal((current) => ({ ...current, open: false }))}
        onSaved={handleEventSaved}
      />
    </AppPage>
  );
}
