"use client";

import { useState } from "react";
import { Layers, MapPin } from "lucide-react";
import {
  countStructureSeverity,
  structureObservationCount,
  structurePreviewUrl,
  type StructurePayload,
} from "./report-utils";

interface ReportStructureGalleryProps {
  structures: StructurePayload[];
  onOpenImage: (url: string) => void;
  onOpenMap: (structureIndex: number) => void;
}

export function ReportStructureGallery({
  structures,
  onOpenImage,
  onOpenMap,
}: ReportStructureGalleryProps) {
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  if (structures.length === 0) {
    return null;
  }

  return (
    <div className="client-report__gallery">
      {structures.map((structure, index) => {
        const previewUrl = structurePreviewUrl(structure);
        const showImage = previewUrl && !brokenImages[structure.id];
        const counts = countStructureSeverity(structure);
        const observationCount = structureObservationCount(structure);

        return (
          <article key={structure.id} className="client-report__card client-report__gallery-card">
            <button
              type="button"
              className="client-report__gallery-media"
              disabled={!showImage}
              onClick={() => showImage && onOpenImage(previewUrl!)}
            >
              {showImage ? (
                <img
                  src={previewUrl!}
                  alt={structure.name}
                  onError={() =>
                    setBrokenImages((current) => ({ ...current, [structure.id]: true }))
                  }
                />
              ) : (
                <div className="client-report__gallery-placeholder">
                  <Layers size={28} />
                  <span>No surface photo</span>
                </div>
              )}
              {observationCount > 0 ? (
                <span className="client-report__gallery-obs-badge">
                  {observationCount} observation{observationCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </button>

            <div className="client-report__gallery-body">
              <div className="client-report__gallery-head">
                <h3>{structure.name}</h3>
                <span>{structure.views.length} view{structure.views.length === 1 ? "" : "s"}</span>
              </div>
              {structure.description ? (
                <p className="client-report__gallery-desc">{structure.description}</p>
              ) : null}
              <div className="client-report__gallery-badges">
                {counts.major ? (
                  <span className="client-report__structure-badge client-report__structure-badge--major">
                    {counts.major} major
                  </span>
                ) : null}
                {counts.moderate ? (
                  <span className="client-report__structure-badge client-report__structure-badge--moderate">
                    {counts.moderate} mod
                  </span>
                ) : null}
                {counts.minor ? (
                  <span className="client-report__structure-badge client-report__structure-badge--minor">
                    {counts.minor} minor
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="client-report__gallery-map-link"
                onClick={() => onOpenMap(index)}
              >
                <MapPin size={14} />
                View on inspection map
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
