"use client";

import { Calendar, MapPin, User } from "lucide-react";
import { BRAND_LOGO_SRC } from "@/lib/brand";

interface ReportHeaderProps {
  title: string;
  customerName?: string | null;
  location?: string | null;
  dateRange?: string | null;
  planViewUrl?: string | null;
  onPlanViewOpen: () => void;
}

export function ReportHeader({
  title,
  customerName,
  location,
  dateRange,
  planViewUrl,
  onPlanViewOpen,
}: ReportHeaderProps) {
  const hasMeta = customerName || location || dateRange;

  return (
    <header className="client-report__header no-print">
      <div className="client-report__header-inner">
        <div className="client-report__header-left">
          <img
            src={BRAND_LOGO_SRC}
            alt="Frogmen Technologies"
            className="client-report__header-logo"
          />
          <div className="client-report__header-divider" aria-hidden />
          <div className="client-report__header-titles">
            <span className="client-report__brand-sub">ROV Inspection Report</span>
            <h1 className="client-report__header-title">{title}</h1>
          </div>
        </div>

        {hasMeta ? (
          <div className="client-report__header-meta">
            {customerName ? (
              <span className="client-report__header-chip">
                <User size={13} />
                {customerName}
              </span>
            ) : null}
            {location ? (
              <span className="client-report__header-chip">
                <MapPin size={13} />
                {location}
              </span>
            ) : null}
            {dateRange ? (
              <span className="client-report__header-chip">
                <Calendar size={13} />
                {dateRange}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="client-report__header-actions">
          {planViewUrl ? (
            <button
              type="button"
              className="client-report__btn client-report__btn--ghost"
              onClick={onPlanViewOpen}
            >
              Plan View
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
