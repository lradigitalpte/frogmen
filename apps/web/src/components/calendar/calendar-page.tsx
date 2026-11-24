"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  InlineStack,
  Modal,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  PlusIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import {
  CALENDAR_SOURCE_LABELS,
  calendarStatusBadge,
  getCalendarSettings,
  listCalendarItems,
  listHolidayCountries,
  listOverdueDeliveries,
  runCalendarRemindersNow,
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
const VIEW_STORAGE_KEY = "frog1.calendar.view";
const MAX_CHIPS_PER_DAY = 3;

type CalendarView = "month" | "agenda";

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

function relativeDay(isoDate: string, today: string) {
  const diff = Math.round(
    (parseIsoDate(isoDate).getTime() - parseIsoDate(today).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    return parseIsoDate(isoDate).toLocaleDateString(undefined, { weekday: "long" });
  }
  return parseIsoDate(isoDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function timeLabel(item: CalendarItem) {
  if (!item.startTime) return null;
  return item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
}

function groupByDate(items: CalendarItem[]) {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = groups.get(item.date) ?? [];
    list.push(item);
    groups.set(item.date, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Small "date tile" used in lists: weekday over day number. */
function DateTile({ iso, today }: { iso: string; today: string }) {
  const date = parseIsoDate(iso);
  return (
    <span className={cn("cal-tile", iso === today && "is-today", iso < today && "is-past")}>
      <small>{date.toLocaleDateString(undefined, { weekday: "short" })}</small>
      <strong>{date.getDate()}</strong>
    </span>
  );
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
  meta,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
  meta?: string | null;
}) {
  const badge = calendarStatusBadge(item.status);
  const time = timeLabel(item);
  const showBadge = badge && item.status !== "upcoming" && item.status !== "today";

  return (
    <button
      className={cn("cal-item", `calendar-dot--${item.source}`)}
      type="button"
      onClick={() => onSelect(item)}
    >
      <span className="cal-item__bar" />
      <span className="cal-item__body">
        <span className="cal-item__title">{item.title}</span>
        <span className="cal-item__meta">
          {[meta, time, CALENDAR_SOURCE_LABELS[item.source], item.subtitle]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {showBadge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
    </button>
  );
}

export function CalendarPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { showSuccess, showError } = useToast();
  const [sendingReminders, setSendingReminders] = useState(false);
  const today = toIsoDate(new Date());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const [sources, setSources] = useState<Set<CalendarSource>>(() => new Set(SOURCE_ORDER));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [overdue, setOverdue] = useState<CalendarItem[]>([]);
  const [trackedCountries, setTrackedCountries] = useState<string[]>([]);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [selectedDay, setSelectedDay] = useState(today);
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    eventId: string | null;
    date: string;
  }>({ open: false, eventId: null, date: today });

  useEffect(() => {
    setMounted(true);
    setSources(loadStoredSources());
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "month" || stored === "agenda") setView(stored);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const grid = useMemo(() => monthGrid(month), [month]);
  const rangeFrom = toIsoDate(grid[0]);
  const rangeTo = toIsoDate(grid[grid.length - 1]);

  // Load every source once; the "Show on calendar" toggles filter locally so
  // switching them is instant and each one can show its count.
  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCalendarItems({ from: rangeFrom, to: rangeTo }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  const loadSidebar = useCallback(async () => {
    try {
      const [nextItems, overdueItems, settings] = await Promise.all([
        listCalendarItems({ from: today, to: toIsoDate(addDays(new Date(), 14)) }),
        listOverdueDeliveries(),
        getCalendarSettings(),
      ]);
      setUpcoming(
        nextItems
          .filter((item) => item.status !== "done" && item.status !== "paid")
          .sort((a, b) => a.date.localeCompare(b.date)),
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

  const monthKey = toIsoDate(month).slice(0, 7);
  const visibleItems = useMemo(
    () => items.filter((item) => sources.has(item.source)),
    [items, sources],
  );
  const byDay = useMemo(() => itemsByDay(visibleItems), [visibleItems]);
  const visibleUpcoming = useMemo(
    () => upcoming.filter((item) => sources.has(item.source)),
    [upcoming, sources],
  );

  const monthItems = useMemo(
    () => items.filter((item) => item.date.startsWith(monthKey)),
    [items, monthKey],
  );
  const sourceCounts = useMemo(() => {
    const counts = new Map<CalendarSource, number>();
    for (const item of monthItems) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    return counts;
  }, [monthItems]);

  const agendaDays = useMemo(
    () =>
      [...byDay.entries()]
        .filter(([date]) => date.startsWith(monthKey))
        .sort(([a], [b]) => a.localeCompare(b)),
    [byDay, monthKey],
  );

  const weekEnd = toIsoDate(addDays(new Date(), 7));
  const stats = {
    month: monthItems.filter((item) => sources.has(item.source)).length,
    week: visibleUpcoming.filter((item) => item.date <= weekEnd).length,
    overdue: overdue.length,
    holidays: monthItems.filter((item) => item.source === "holiday").length,
  };
  const nextUp = visibleUpcoming[0] ?? null;

  function changeMonth(next: Date) {
    const start = startOfMonth(next);
    setMonth(start);
    const key = toIsoDate(start).slice(0, 7);
    setSelectedDay(today.startsWith(key) ? today : toIsoDate(start));
  }

  function changeView(next: CalendarView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }

  function updateSources(next: Set<CalendarSource>) {
    storeSources(next);
    setSources(next);
  }

  function toggleSource(source: CalendarSource) {
    const next = new Set(sources);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    updateSources(next);
  }

  function handleSelect(item: CalendarItem) {
    if (item.source === "event" && item.eventId) {
      setEventModal({ open: true, eventId: item.eventId, date: item.date });
      return;
    }
    setSelectedItem(item);
  }

  function openNewEvent(date: string) {
    setEventModal({ open: true, eventId: null, date });
  }

  function handleEventSaved() {
    setEventModal((current) => ({ ...current, open: false }));
    void loadMonth();
    void loadSidebar();
  }

  const monthTitle = mounted
    ? month.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";
  const selectedBadge = selectedItem ? calendarStatusBadge(selectedItem.status) : null;
  const dayItems = byDay.get(selectedDay) ?? [];
  const todayDate = parseIsoDate(today);

  async function handleSendReminders() {
    setSendingReminders(true);
    try {
      const result = await runCalendarRemindersNow();
      if (result.skipped) {
        showError(result.skipped);
      } else {
        const total = result.eventRemindersSent + result.digestsSent;
        showSuccess(
          total
            ? `Sent ${result.eventRemindersSent} event reminder${result.eventRemindersSent === 1 ? "" : "s"} and ${result.digestsSent} digest${result.digestsSent === 1 ? "" : "s"}`
            : "Nothing due right now — everything due has already been sent",
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  }

  return (
    <AppPage
      primaryAction={{ content: "New event", icon: PlusIcon, onAction: () => openNewEvent(selectedDay) }}
      secondaryActions={[
        {
          content: "Send due reminders",
          loading: sendingReminders,
          onAction: () => void handleSendReminders(),
        },
        {
          content: "Calendar settings",
          onAction: () => router.push("/dashboard/calendar/settings"),
        },
      ]}
      subtitle="Holidays, deliveries, due dates, anniversaries and your team's events in one place."
      title="Calendar"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Hero: today + the month at a glance */}
        <section className="cal-hero">
          <div className="cal-hero__today">
            <span className="cal-hero__badge">
              <small>{mounted ? todayDate.toLocaleDateString(undefined, { month: "short" }) : ""}</small>
              <strong>{todayDate.getDate()}</strong>
            </span>
            <div>
              <span className="cal-hero__label">Today</span>
              <span className="cal-hero__date">
                {mounted ? todayDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : ""}
              </span>
              <span className="cal-hero__next">
                {nextUp
                  ? `Next up: ${nextUp.title} · ${mounted ? relativeDay(nextUp.date, today) : ""}`
                  : "Nothing scheduled in the next two weeks."}
              </span>
            </div>
          </div>
          <div className="cal-hero__stats">
            <button type="button" onClick={() => changeView("agenda")}>
              <span>{monthTitle ? `In ${monthTitle.split(" ")[0]}` : "This month"}</span>
              <strong>{stats.month}</strong>
              <small>items on the calendar</small>
            </button>
            <div>
              <span>Next 7 days</span>
              <strong>{stats.week}</strong>
              <small>coming up</small>
            </div>
            <button
              type="button"
              className={stats.overdue ? "is-alert" : undefined}
              onClick={() => document.getElementById("cal-overdue")?.scrollIntoView({ behavior: "smooth" })}
              disabled={!stats.overdue}
            >
              <span>Overdue deliveries</span>
              <strong>{stats.overdue}</strong>
              <small>{stats.overdue ? "need chasing" : "all on time"}</small>
            </button>
            <div>
              <span>Public holidays</span>
              <strong>{stats.holidays}</strong>
              <small>{trackedCountries.length ? `${trackedCountries.length} countries tracked` : "no countries tracked"}</small>
            </div>
          </div>
        </section>

        <div className="cal-layout">
          {/* Main calendar */}
          <Card padding="0">
            <div className="cal-toolbar">
              <div className="cal-toolbar__nav">
                <ButtonGroup variant="segmented">
                  <Button
                    accessibilityLabel="Previous month"
                    icon={ChevronLeftIcon}
                    onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  />
                  <Button onClick={() => changeMonth(new Date())}>Today</Button>
                  <Button
                    accessibilityLabel="Next month"
                    icon={ChevronRightIcon}
                    onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  />
                </ButtonGroup>
                <h2 className="cal-toolbar__title">{monthTitle}</h2>
              </div>
              <ButtonGroup variant="segmented">
                <Button pressed={view === "month"} onClick={() => changeView("month")}>
                  Month
                </Button>
                <Button pressed={view === "agenda"} onClick={() => changeView("agenda")}>
                  Agenda
                </Button>
              </ButtonGroup>
            </div>

            {view === "month" ? (
              <div className={cn("calendar-month", loading && "calendar-month--loading")}>
                {WEEKDAYS.map((day, index) => (
                  <div className={cn("calendar-month__weekday", index > 4 && "is-weekend")} key={day}>
                    {day}
                  </div>
                ))}
                {grid.map((day) => {
                  const iso = toIsoDate(day);
                  const dayList = byDay.get(iso) ?? [];
                  const hidden = dayList.length - MAX_CHIPS_PER_DAY;
                  const hasHoliday = dayList.some((item) => item.source === "holiday");
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      aria-label={`${iso}, ${dayList.length} items`}
                      aria-pressed={selectedDay === iso}
                      className={cn(
                        "calendar-month__day",
                        day.getMonth() !== month.getMonth() && "calendar-month__day--outside",
                        iso === today && "calendar-month__day--today",
                        iso < today && "calendar-month__day--past",
                        weekend && "calendar-month__day--weekend",
                        hasHoliday && "calendar-month__day--holiday",
                        selectedDay === iso && "calendar-month__day--selected",
                      )}
                      key={iso}
                      role="button"
                      tabIndex={0}
                      title="Click to see the day · double-click to add an event"
                      onClick={() => setSelectedDay(iso)}
                      onDoubleClick={() => openNewEvent(iso)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDay(iso);
                        }
                      }}
                    >
                      <div className="calendar-month__head">
                        <span className="calendar-month__date">{day.getDate()}</span>
                        <button
                          aria-label={`Add event on ${iso}`}
                          className="calendar-month__add"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openNewEvent(iso);
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div className="calendar-month__chips">
                        {dayList.slice(0, MAX_CHIPS_PER_DAY).map((item) => (
                          <CalendarChip item={item} key={`${iso}-${item.id}`} onSelect={handleSelect} />
                        ))}
                        {hidden > 0 ? (
                          <span className="calendar-more">+{hidden} more</span>
                        ) : null}
                      </div>
                      {dayList.length ? (
                        <div className="calendar-month__dots" aria-hidden>
                          {dayList.slice(0, 4).map((item) => (
                            <span className={cn("calendar-dot", `calendar-dot--${item.source}`)} key={`d-${item.id}`} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cal-agenda">
                {loading ? (
                  <Box padding="400">
                    <SkeletonBodyText lines={8} />
                  </Box>
                ) : agendaDays.length === 0 ? (
                  <div className="cal-empty">
                    <span className="cal-empty__icon">
                      <CalendarIcon />
                    </span>
                    <strong>Nothing scheduled in {monthTitle}</strong>
                    <p>Add a meeting, reminder or deadline, or turn on more sources on the right.</p>
                    <Button icon={PlusIcon} onClick={() => openNewEvent(selectedDay)}>
                      New event
                    </Button>
                  </div>
                ) : (
                  agendaDays.map(([date, list]) => (
                    <div className={cn("cal-agenda__day", date < today && "is-past")} key={date}>
                      <DateTile iso={date} today={today} />
                      <div className="cal-agenda__items">
                        {list.map((item) => (
                          <CalendarItemRow item={item} key={`${date}-${item.id}`} onSelect={handleSelect} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Legend doubles as the source filter */}
            <div className="cal-legend">
              <div className="cal-legend__head">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  Show on calendar
                </Text>
                <InlineStack gap="200">
                  <Button variant="plain" size="slim" onClick={() => updateSources(new Set(SOURCE_ORDER))}>
                    All
                  </Button>
                  <Button variant="plain" size="slim" onClick={() => updateSources(new Set(["event"]))}>
                    Only my events
                  </Button>
                </InlineStack>
              </div>
              <div className="cal-legend__chips">
                {SOURCE_ORDER.map((source) => {
                  const on = sources.has(source);
                  const count = sourceCounts.get(source) ?? 0;
                  return (
                    <button
                      aria-pressed={on}
                      className={cn("cal-filter", `calendar-dot--${source}`, on && "is-on")}
                      key={source}
                      type="button"
                      onClick={() => toggleSource(source)}
                    >
                      <span className="cal-filter__dot" />
                      {CALENDAR_SOURCE_LABELS[source]}
                      {count ? <span className="cal-filter__count">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Side column */}
          <div className="cal-side">
            <Card>
              <BlockStack gap="300">
                <div className="cal-day-head">
                  {mounted ? <DateTile iso={selectedDay} today={today} /> : null}
                  <div>
                    <Text as="h2" variant="headingMd">
                      {mounted ? relativeDay(selectedDay, today) : ""}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {mounted ? formatLongDate(selectedDay) : ""}
                    </Text>
                  </div>
                  <Button icon={PlusIcon} size="slim" onClick={() => openNewEvent(selectedDay)}>
                    Add
                  </Button>
                </div>
                {dayItems.length === 0 ? (
                  <div className="cal-day-empty">
                    Nothing on this day. Double-click any day on the calendar to add an event.
                  </div>
                ) : (
                  <div className="cal-list">
                    {dayItems.map((item) => (
                      <CalendarItemRow item={item} key={`day-${item.id}`} onSelect={handleSelect} />
                    ))}
                  </div>
                )}
              </BlockStack>
            </Card>

            {overdue.length ? (
              <div id="cal-overdue">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Overdue deliveries
                      </Text>
                      <Badge tone="critical">{String(overdue.length)}</Badge>
                    </InlineStack>
                    <div className="cal-list">
                      {overdue.slice(0, 6).map((item) => (
                        <CalendarItemRow
                          item={item}
                          key={item.id}
                          meta={mounted ? `Expected ${relativeDay(item.date, today)}` : null}
                          onSelect={handleSelect}
                        />
                      ))}
                    </div>
                  </BlockStack>
                </Card>
              </div>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Coming up
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Next 14 days
                  </Text>
                </InlineStack>
                {visibleUpcoming.length === 0 ? (
                  <div className="cal-day-empty">You&apos;re all clear for the next two weeks.</div>
                ) : (
                  <div className="cal-upcoming">
                    {groupByDate(visibleUpcoming.slice(0, 10)).map(([date, list]) => (
                      <div className="cal-upcoming__group" key={date}>
                        <span className="cal-upcoming__label">{mounted ? relativeDay(date, today) : ""}</span>
                        {list.map((item) => (
                          <CalendarItemRow item={item} key={`up-${item.id}`} onSelect={handleSelect} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Holiday countries
                  </Text>
                  {trackedCountries.length ? (
                    <Button variant="plain" onClick={() => router.push("/dashboard/calendar/settings")}>
                      Manage
                    </Button>
                  ) : null}
                </InlineStack>
                {trackedCountries.length === 0 ? (
                  <div className="cal-countries-empty">
                    <span className="cal-empty__icon">
                      <GlobeIcon />
                    </span>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Track the countries you work in to see their public holidays on the calendar.
                    </Text>
                    <Button onClick={() => router.push("/dashboard/calendar/settings")}>Add countries</Button>
                  </div>
                ) : (
                  <InlineStack gap="200">
                    {trackedCountries.map((code) => (
                      <Badge key={code}>{countryNames[code] ?? code}</Badge>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </div>
        </div>
      </BlockStack>

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
                {selectedBadge ? <Badge tone={selectedBadge.tone}>{selectedBadge.label}</Badge> : null}
              </InlineStack>
              <Text as="p" variant="headingSm">
                {formatLongDate(selectedItem.date)}
                {selectedItem.endDate && selectedItem.endDate > selectedItem.date
                  ? ` – ${formatLongDate(selectedItem.endDate)}`
                  : ""}
              </Text>
              {selectedItem.subtitle ? <Text as="p">{selectedItem.subtitle}</Text> : null}
            </BlockStack>
          </Modal.Section>
        ) : null}
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
