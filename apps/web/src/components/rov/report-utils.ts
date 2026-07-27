import { normalizeSeverity } from "@frog1/shared";
import type { InspectionMedia, InspectionPoint } from "@/types/rov";
import type { PublicReportPayload } from "@/types/rov";

export { severityPinColor } from "@frog1/shared";

export type ReportTab =
  | "home"
  | "images"
  | "map"
  | "observations"
  | "data"
  | "conclusions";

export type StructurePayload = NonNullable<PublicReportPayload["project"]>["structures"][number];
export type ViewPayload = StructurePayload["views"][number];
export type PointPayload = ViewPayload["points"][number];

export function countStructureSeverity(structure: StructurePayload) {
  let major = 0;
  let moderate = 0;
  let minor = 0;
  for (const view of structure.views) {
    for (const point of view.points) {
      const s = normalizeSeverity(point.severity);
      if (s === "major") major++;
      else if (s === "moderate") moderate++;
      else if (s === "minor") minor++;
    }
  }
  return { major, moderate, minor };
}

export function projectHasObservations(project: PublicReportPayload["project"]) {
  if (!project) return false;
  return project.structures.some((structure) =>
    structure.views.some((view) => view.points.length > 0),
  );
}

export interface MediaItem {
  media: InspectionMedia;
  structure: StructurePayload;
  point: InspectionPoint | null;
}

export function collectProjectMedia(project: PublicReportPayload["project"]): MediaItem[] {
  if (!project) return [];
  const items: MediaItem[] = [];
  for (const structure of project.structures) {
    for (const view of structure.views) {
      for (const point of view.points) {
        for (const media of point.media ?? []) {
          items.push({ media, structure, point });
        }
      }
    }
    for (const media of structure.unlinkedMedia ?? []) {
      items.push({ media, structure, point: null });
    }
  }
  return items;
}

export function parseCoordinates(
  latitude: string | null | undefined,
  longitude: string | null | undefined,
) {
  const lat = latitude ? Number.parseFloat(latitude) : Number.NaN;
  const lng = longitude ? Number.parseFloat(longitude) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function pointDisplayId(point: PointPayload) {
  return point.observationId ?? (point.pointNumber != null ? String(point.pointNumber) : " ");
}

export function structurePreviewUrl(structure: StructurePayload) {
  return structure.photoUrl ?? structure.diagramUrl ?? null;
}

export function structureObservationCount(structure: StructurePayload) {
  return structure.views.reduce((total, view) => total + view.points.length, 0);
}

export function truncateText(text: string, maxLength: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}
