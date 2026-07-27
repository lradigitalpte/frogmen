"use client";

import { parseCoordinates } from "./report-utils";

interface ReportProjectMapProps {
  latitude: string | null | undefined;
  longitude: string | null | undefined;
  siteMapUrl?: string | null;
  projectName?: string | null;
  onSiteMapClick?: (url: string) => void;
}

export function ReportProjectMap({
  latitude,
  longitude,
  siteMapUrl,
  projectName,
  onSiteMapClick,
}: ReportProjectMapProps) {
  const coords = parseCoordinates(latitude, longitude);

  if (coords) {
    const { lat, lng } = coords;
    const delta = 0.012;
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;

    return (
      <div className="client-report__map-stack">
        <iframe
          title={projectName ? `Map: ${projectName}` : "Project location map"}
          className="client-report__map-iframe"
          src={embedUrl}
          loading="lazy"
        />
        {siteMapUrl ? (
          <button
            type="button"
            className="client-report__site-map-thumb"
            onClick={() => onSiteMapClick?.(siteMapUrl)}
          >
            <img src={siteMapUrl} alt="Site map preview" />
            <span>View site map</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (siteMapUrl) {
    return (
      <button
        type="button"
        className="client-report__site-map-hero"
        onClick={() => onSiteMapClick?.(siteMapUrl)}
        aria-label="Open site map"
      >
        <img src={siteMapUrl} alt={projectName ? `Site map: ${projectName}` : "Site map"} />
        <span className="client-report__site-map-hero-hint">Click to enlarge</span>
      </button>
    );
  }

  return (
    <div className="client-report__map-empty">
      <svg
        className="client-report__map-empty-icon"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
        />
      </svg>
      <p>No GPS coordinates or site map set</p>
    </div>
  );
}

export function reportLocationLabel(
  latitude: string | null | undefined,
  longitude: string | null | undefined,
  siteMapUrl?: string | null,
) {
  const coords = parseCoordinates(latitude, longitude);
  if (coords) return "Project Location";
  if (siteMapUrl) return "Site Map";
  return "Project Location";
}
