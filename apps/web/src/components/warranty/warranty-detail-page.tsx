"use client";

import { Badge, Banner, Button, Icon, SkeletonBodyText, SkeletonDisplayText } from "@shopify/polaris";
import {
  ChevronRightIcon,
  DuplicateIcon,
  OrderIcon,
  PersonIcon,
  ProductIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatAppDate } from "@/lib/format-date";
import { formatQuantity } from "@/lib/format-quantity";
import { cn } from "@/lib/utils";
import { getWarranty, listWarranties, type WarrantyRegistration } from "@/lib/warranty-api";
import { ConfirmDeliveryModal } from "./confirm-delivery-modal";

interface WarrantyDetailPageProps {
  warrantyId: string;
}

type Status = WarrantyRegistration["status"];

const EXPIRING_DAYS = 30;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatAppDate(value) || "—";
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function statusTone(status: Status, daysLeft: number): "success" | "warning" | "critical" | "attention" | undefined {
  if (status === "active") return daysLeft <= EXPIRING_DAYS ? "warning" : "success";
  if (status === "expired") return "critical";
  if (status === "pending_delivery") return "attention";
  return undefined;
}

function statusLabel(status: Status, daysLeft: number) {
  if (status === "pending_delivery") return "Pending delivery";
  if (status === "active") return daysLeft <= EXPIRING_DAYS ? "Expiring soon" : "Active";
  if (status === "expired") return "Expired";
  return "Voided";
}

function toTime(value: string | null | undefined) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime() : null;
}

/** Big headline for the hero. */
function headline(w: WarrantyRegistration): { value: string; caption: string } {
  if (w.status === "voided") return { value: "Voided", caption: "This warranty no longer applies" };
  if (w.status === "pending_delivery") {
    return { value: "Not started", caption: "Coverage starts when delivery is confirmed" };
  }
  const d = w.daysLeft;
  if (w.status === "expired" || d < 0) {
    return { value: "Expired", caption: `Ended ${formatDate(w.endsAt)} · ${plural(Math.abs(d), "day")} ago` };
  }
  if (d === 0) return { value: "Ends today", caption: `Last day of cover is ${formatDate(w.endsAt)}` };
  if (d < 60) return { value: plural(d, "day"), caption: `left · ends ${formatDate(w.endsAt)}` };
  const months = Math.floor(d / 30.44);
  return { value: plural(months, "month"), caption: `left · ${d.toLocaleString()} days · ends ${formatDate(w.endsAt)}` };
}

export function WarrantyDetailPage({ warrantyId }: WarrantyDetailPageProps) {
  const { showSuccess } = useToast();
  const [warranty, setWarranty] = useState<WarrantyRegistration | null>(null);
  const [history, setHistory] = useState<WarrantyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWarranty(warrantyId);
      setWarranty(data);
      if (data.productUnitId) {
        listWarranties({ productUnitId: data.productUnitId, perPage: 20 })
          .then((r) => setHistory(r.data.filter((w) => w.id !== data.id)))
          .catch(() => setHistory([]));
      } else {
        setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warranty");
    } finally {
      setLoading(false);
    }
  }, [warrantyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !warranty) {
    return (
      <AppPage backAction={{ content: "Warranty", url: "/dashboard/warranty" }} fullWidth title="Warranty">
        <div className="pl">
          <section className="pl-hero wd-hero">
            <SkeletonDisplayText size="large" />
            <SkeletonBodyText lines={3} />
          </section>
          <div className="ex-surface ex-pad">
            <SkeletonBodyText lines={6} />
          </div>
        </div>
      </AppPage>
    );
  }

  if (!warranty) {
    return (
      <AppPage backAction={{ content: "Warranty", url: "/dashboard/warranty" }} title="Warranty">
        <Banner tone="critical" action={{ content: "Try again", onAction: () => void load() }}>
          {error ?? "Warranty not found"}
        </Banner>
      </AppPage>
    );
  }

  const w = warranty;
  const pending = w.status === "pending_delivery";
  const voided = w.status === "voided";
  const head = headline(w);
  const tone = statusTone(w.status, w.daysLeft);

  // Coverage progress between start and end, with today's position.
  const start = toTime(w.startsAt ?? w.soldAt);
  const end = toTime(w.endsAt);
  const now = Date.now();
  const used =
    w.status === "expired" ? 100 : start && end && end > start && !pending ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;
  const level = w.status === "expired" ? "out" : w.status === "active" && w.daysLeft <= EXPIRING_DAYS ? "low" : "ok";

  const startedAtSale = !pending && !w.deliveredAt && w.startsAt && w.startsAt.slice(0, 10) === w.soldAt?.slice(0, 10);

  const timeline: Array<{ label: string; date: string | null | undefined; note?: string; state: "done" | "now" | "todo" }> = [
    { label: "Sold", date: w.soldAt, note: w.invoiceNumber ? `Invoice ${w.invoiceNumber}` : w.source === "manual" ? "Registered by hand" : undefined, state: "done" },
    {
      label: "Delivered",
      date: w.deliveredAt,
      note: w.deliveredAt
        ? w.deliveryNoteNumber
          ? `Delivery note ${w.deliveryNoteNumber}`
          : undefined
        : pending
          ? "Waiting for confirmation"
          : "No delivery date recorded",
      state: w.deliveredAt ? "done" : pending ? "now" : "todo",
    },
    {
      label: "Coverage starts",
      date: pending ? null : w.startsAt,
      note: pending ? "On the delivery date" : startedAtSale ? "Started from the sale date" : undefined,
      state: pending ? "todo" : "done",
    },
    {
      label: w.status === "expired" ? "Coverage ended" : "Coverage ends",
      date: pending ? null : w.endsAt,
      note: pending
        ? w.policy
          ? `${plural(w.policy.durationMonths, "month")} after delivery`
          : undefined
        : w.status === "active"
          ? head.value === "Ends today"
            ? "Today"
            : `In ${plural(w.daysLeft, "day")}`
          : undefined,
      state: w.status === "expired" ? "done" : w.status === "active" ? "now" : "todo",
    },
  ];

  const related = [
    w.productId
      ? { icon: ProductIcon, label: "Product", value: w.displayProductName, url: `/dashboard/inventory/products/${w.productId}` }
      : null,
    w.productUnitId
      ? { icon: ShieldCheckMarkIcon, label: "Serial unit", value: w.serialNumber ?? "Open unit", url: `/dashboard/inventory/units/${w.productUnitId}` }
      : null,
    w.customerId
      ? { icon: PersonIcon, label: "Customer", value: w.displayCustomerName, url: `/dashboard/customers/${w.customerId}` }
      : null,
    w.invoiceId
      ? { icon: OrderIcon, label: "Invoice", value: w.invoiceNumber ?? "Open invoice", url: `/dashboard/invoices/${w.invoiceId}` }
      : null,
  ].filter(Boolean) as Array<{ icon: typeof ProductIcon; label: string; value: string; url: string }>;

  async function copySerial() {
    if (!w.serialNumber) return;
    try {
      await navigator.clipboard.writeText(w.serialNumber);
      showSuccess("Serial number copied");
    } catch {
      // Clipboard can be blocked; nothing else to do.
    }
  }

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      primaryAction={
        voided
          ? undefined
          : { content: pending ? "Confirm delivery" : "Change delivery date", onAction: () => setDeliveryOpen(true) }
      }
      secondaryActions={[{ content: "All warranties", url: "/dashboard/warranty" }]}
      subtitle={w.policy?.name ?? "Warranty coverage"}
      title={w.displayProductName}
    >
      <div className="pl wd">
        {error ? <div className="ac-error">{error}</div> : null}

        {pending ? (
          <Banner tone="warning" action={{ content: "Confirm delivery", onAction: () => setDeliveryOpen(true) }}>
            The warranty hasn&apos;t started because delivery isn&apos;t confirmed yet. Confirming starts coverage on the
            delivery date.
          </Banner>
        ) : null}

        <section className={cn("pl-hero wd-hero", loading && "is-loading")}>
          <div className="wd-hero__top">
            <div className="wd-hero__id">
              <span className="wd-hero__icon" aria-hidden>
                <Icon source={ShieldCheckMarkIcon} />
              </span>
              <span>
                <span className="pl-hero__label">{w.policy?.name ?? "Warranty"}</span>
                <strong className="wd-hero__product">{w.displayProductName}</strong>
                {w.serialNumber ? (
                  <button className="wd-serial" title="Copy serial number" type="button" onClick={() => void copySerial()}>
                    SN {w.serialNumber}
                    <Icon source={DuplicateIcon} />
                  </button>
                ) : null}
              </span>
            </div>
            <Badge tone={tone}>{statusLabel(w.status, w.daysLeft)}</Badge>
          </div>

          <div className="wd-hero__main">
            <strong className="pl-hero__value">{head.value}</strong>
            <span className="pl-hero__period">{head.caption}</span>
          </div>

          {!pending && !voided ? (
            <div className="wd-progress">
              <div className={cn("wd-progress__bar", `is-${level}`)}>
                <b style={{ width: `${used}%` }} />
                {w.status === "active" ? <i style={{ left: `${used}%` }} title="Today" /> : null}
              </div>
              <div className="wd-progress__ends">
                <span>
                  <small>Started</small>
                  {formatDate(w.startsAt)}
                </span>
                <span>{`${Math.round(used)}% of cover used`}</span>
                <span>
                  <small>Ends</small>
                  {formatDate(w.endsAt)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="wd-hero__tiles">
            <div className="ac-tile">
              <span>Customer</span>
              <strong>{w.displayCustomerName}</strong>
            </div>
            <div className="ac-tile">
              <span>Sold</span>
              <strong>{formatDate(w.soldAt)}</strong>
            </div>
            <div className="ac-tile">
              <span>Delivered</span>
              <strong>{w.deliveredAt ? formatDate(w.deliveredAt) : pending ? "Pending" : "Not recorded"}</strong>
            </div>
            <div className="ac-tile">
              <span>Quantity</span>
              <strong>{formatQuantity(w.quantity)}</strong>
            </div>
          </div>
        </section>

        <div className="wd-layout">
          <div className="wd-main">
            <section className="ex-surface ex-pad wd-card">
              <h2 className="wd-card__title">Coverage timeline</h2>
              <ol className="wd-timeline">
                {timeline.map((step) => (
                  <li className={cn("wd-step", `is-${step.state}`)} key={step.label}>
                    <span className="wd-step__dot" aria-hidden />
                    <span className="wd-step__body">
                      <strong>{step.label}</strong>
                      {step.note ? <small>{step.note}</small> : null}
                    </span>
                    <span className="wd-step__date">{step.date ? formatDate(step.date) : "—"}</span>
                  </li>
                ))}
              </ol>
              {!voided && !pending && !w.deliveredAt ? (
                <p className="wd-hint">
                  No delivery date is on file, so coverage is counted from the sale date.{" "}
                  <button className="st-link" type="button" onClick={() => setDeliveryOpen(true)}>
                    Set the delivery date
                  </button>{" "}
                  to count it from when the customer actually received it.
                </p>
              ) : null}
            </section>

            <section className="ex-surface ex-pad wd-card">
              <div className="wd-card__head">
                <h2 className="wd-card__title">What&apos;s covered</h2>
                <NextLink className="st-link" href="/dashboard/warranty/policies">
                  Manage policies
                </NextLink>
              </div>
              <div className="wd-policy">
                {w.policy ? (
                  <span className="wp-card__term" aria-hidden>
                    <strong>{w.policy.durationMonths % 12 === 0 ? w.policy.durationMonths / 12 : w.policy.durationMonths}</strong>
                    <small>
                      {w.policy.durationMonths % 12 === 0
                        ? w.policy.durationMonths === 12
                          ? "year"
                          : "years"
                        : w.policy.durationMonths === 1
                          ? "month"
                          : "months"}
                    </small>
                  </span>
                ) : null}
                <span>
                  <strong>{w.policy?.name ?? "No policy"}</strong>
                  <p className={cn(!w.policyDescription && "is-empty")}>
                    {w.policyDescription || "This policy has no description yet."}
                  </p>
                </span>
              </div>
            </section>

            {w.notes ? (
              <section className="ex-surface ex-pad wd-card">
                <h2 className="wd-card__title">Notes</h2>
                <p className="wd-notes">{w.notes}</p>
              </section>
            ) : null}
          </div>

          <aside className="wd-side">
            <section className="ex-surface wd-card">
              <h2 className="wd-card__title ex-pad">Related records</h2>
              {related.length === 0 ? (
                <p className="wd-hint ex-pad">Nothing linked to this warranty.</p>
              ) : (
                <ul className="wd-links">
                  {related.map((r) => (
                    <li key={r.label}>
                      <NextLink href={r.url}>
                        <span className="wd-links__icon">
                          <Icon source={r.icon} />
                        </span>
                        <span className="wd-links__text">
                          <small>{r.label}</small>
                          <strong>{r.value}</strong>
                        </span>
                        <Icon source={ChevronRightIcon} />
                      </NextLink>
                    </li>
                  ))}
                  {w.deliveryNoteId ? (
                    <li>
                      <span className="wd-links__static">
                        <span className="wd-links__icon">
                          <Icon source={OrderIcon} />
                        </span>
                        <span className="wd-links__text">
                          <small>Delivery note</small>
                          <strong>{w.deliveryNoteNumber ?? "Linked"}</strong>
                        </span>
                      </span>
                    </li>
                  ) : null}
                </ul>
              )}
            </section>

            <section className="ex-surface ex-pad wd-card">
              <h2 className="wd-card__title">Details</h2>
              <dl className="wd-facts">
                <div>
                  <dt>Source</dt>
                  <dd>{w.source === "sale" ? "From a sale" : "Registered by hand"}</dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>{formatDate(w.createdAt)}</dd>
                </div>
                {w.productSku ? (
                  <div>
                    <dt>SKU</dt>
                    <dd>{w.productSku}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDate(w.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            {history.length > 0 ? (
              <section className="ex-surface wd-card">
                <h2 className="wd-card__title ex-pad">Other warranties on this unit</h2>
                <ul className="wd-links">
                  {history.map((h) => (
                    <li key={h.id}>
                      <NextLink href={`/dashboard/warranty/${h.id}`}>
                        <span className="wd-links__text">
                          <small>{`${formatDate(h.startsAt ?? h.soldAt)} – ${formatDate(h.endsAt)}`}</small>
                          <strong>{h.policy?.name ?? "Warranty"}</strong>
                        </span>
                        <Badge tone={statusTone(h.status, h.daysLeft)}>{statusLabel(h.status, h.daysLeft)}</Badge>
                      </NextLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!voided ? (
              <Button fullWidth onClick={() => setDeliveryOpen(true)}>
                {pending ? "Confirm delivery" : "Change delivery date"}
              </Button>
            ) : null}
          </aside>
        </div>
      </div>

      <ConfirmDeliveryModal
        open={deliveryOpen}
        warranty={w}
        onClose={() => setDeliveryOpen(false)}
        onSuccess={(updated) => {
          setWarranty(updated);
          showSuccess(pending ? "Delivery confirmed, coverage started" : "Delivery date updated");
        }}
      />
    </AppPage>
  );
}
