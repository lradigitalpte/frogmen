"use client";

import { Fragment } from "react";
import type { PointPayload } from "./report-utils";
import { severityPinColor } from "@frog1/shared";
import { pointDisplayId } from "./report-utils";

interface ReportObservationTableProps {
  points: PointPayload[];
  activePinId: string | null;
  onTogglePin: (id: string | null) => void;
  onOpenLightbox?: (url: string) => void;
  variant?: "compact" | "full";
  showDiveLocation?: boolean;
}

export function ReportObservationTable({
  points,
  activePinId,
  onTogglePin,
  onOpenLightbox,
  variant = "compact",
  showDiveLocation = false,
}: ReportObservationTableProps) {
  if (points.length === 0) {
    return (
      <p className="client-report__obs-empty">No observations for this view.</p>
    );
  }

  return (
    <div className="client-report__table-wrap">
      <table className="client-report__table client-report__table--obs">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type / Description</th>
            {showDiveLocation ? <th>Dive Location</th> : null}
            <th className="client-report__table-align-right">Depth</th>
            <th className="client-report__table-align-center">Media</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const expanded = activePinId === point.id;
            const pinColor = severityPinColor(point.severity);
            const colSpan = showDiveLocation ? 5 : 4;

            return (
              <Fragment key={point.id}>
                <tr
                  className={
                    expanded
                      ? "client-report__table-row client-report__table-row--active"
                      : "client-report__table-row"
                  }
                  onClick={() => onTogglePin(expanded ? null : point.id)}
                >
                  <td>
                    <span
                      className="client-report__pin-badge"
                      style={{ backgroundColor: pinColor }}
                    >
                      {pointDisplayId(point)}
                    </span>
                  </td>
                  <td>
                    <strong>{point.findingType ?? " "}</strong>
                    {point.description ? (
                      <span className="client-report__table-sub">{point.description}</span>
                    ) : null}
                  </td>
                  {showDiveLocation ? (
                    <td className="client-report__table-muted">{point.diveLocation ?? " "}</td>
                  ) : null}
                  <td className="client-report__table-align-right client-report__table-muted">
                    {point.depthM ? `${point.depthM} m` : " "}
                  </td>
                  <td className="client-report__table-align-center">
                    {point.media?.length ? (
                      <span className="client-report__media-count">{point.media.length}</span>
                    ) : (
                      <span className="client-report__table-muted"> </span>
                    )}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="client-report__table-row--expanded">
                    <td colSpan={colSpan}>
                      <PointMediaPanel
                        point={point}
                        variant={variant}
                        onOpenLightbox={onOpenLightbox}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PointMediaPanel({
  point,
  variant,
  onOpenLightbox,
}: {
  point: PointPayload;
  variant: "compact" | "full";
  onOpenLightbox?: (url: string) => void;
}) {
  const media = point.media ?? [];

  if (media.length === 0) {
    return <p className="client-report__obs-no-media">No media linked to this observation.</p>;
  }

  return (
    <div className="client-report__inline-media">
      <p className="client-report__inline-media-label">
        Media · {pointDisplayId(point)}
      </p>
      <div
        className={
          variant === "full"
            ? "client-report__media-grid"
            : "client-report__inline-media-stack"
        }
      >
        {media.map((item) =>
          item.mediaType === "video" && item.url ? (
            <div key={item.id} className="client-report__media-card">
              <video src={item.url} controls preload="metadata" />
              <div className="client-report__media-card-foot">
                <span>{item.fileName}</span>
                <a href={item.url} download={item.fileName}>
                  Download
                </a>
              </div>
            </div>
          ) : item.url ? (
            <div key={item.id} className="client-report__media-card">
              <img
                src={item.url}
                alt={item.fileName}
                className={onOpenLightbox ? "client-report__media-clickable" : undefined}
                onClick={onOpenLightbox ? () => onOpenLightbox(item.url!) : undefined}
              />
              <div className="client-report__media-card-foot">
                <span>{item.fileName}</span>
                <a href={item.url} download={item.fileName}>
                  Download
                </a>
              </div>
            </div>
          ) : null,
        )}
      </div>
      {point.recommendations ? (
        <div className="client-report__recommendation">
          <strong>Recommendation:</strong> {point.recommendations}
        </div>
      ) : null}
    </div>
  );
}
