import { apiFetch } from "./api";
import type {
  CreateMediaInput,
  CreateReportInput,
  CreateRovProjectInput,
  CreateStructureInput,
  InspectionMedia,
  InspectionPoint,
  InspectionReport,
  InspectionView,
  PaginatedRovProjects,
  ProjectStructure,
  PublicReportPayload,
  RovProject,
} from "@/types/rov";

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function rovAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("rov-inspection/")) return null;
  const parts = path.split("/");
  if (parts[0] !== "rov" || parts.length < 3) return null;
  const fileName = parts.at(-1) ?? "";
  if (!fileName.includes(".")) return null;
  const suffix = parts.slice(2).join("/");
  return `/api/v1/files/rov/${suffix}`;
}

export function listRovProjects(params: {
  search?: string;
  status?: string;
  page?: number;
  perPage?: number;
} = {}) {
  return apiFetch<PaginatedRovProjects>(
    `/api/v1/rov/projects${toQuery(params)}`,
  );
}

export function getRovProject(id: string) {
  return apiFetch<RovProject>(`/api/v1/rov/projects/${id}`);
}

export function createRovProject(input: CreateRovProjectInput) {
  return apiFetch<RovProject>("/api/v1/rov/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRovProject(id: string, input: Partial<CreateRovProjectInput>) {
  return apiFetch<RovProject>(`/api/v1/rov/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteRovProject(id: string) {
  return apiFetch<RovProject>(`/api/v1/rov/projects/${id}`, {
    method: "DELETE",
  });
}

export async function uploadProjectPlanView(projectId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/v1/rov/projects/${projectId}/plan-view`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "Upload failed");
  }
  return response.json() as Promise<RovProject>;
}

export function removeProjectPlanView(projectId: string) {
  return apiFetch<RovProject>(`/api/v1/rov/projects/${projectId}/plan-view`, {
    method: "DELETE",
  });
}

export async function uploadProjectSiteMap(projectId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/v1/rov/projects/${projectId}/site-map`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "Upload failed");
  }
  return response.json() as Promise<RovProject>;
}

export function removeProjectSiteMap(projectId: string) {
  return apiFetch<RovProject>(`/api/v1/rov/projects/${projectId}/site-map`, {
    method: "DELETE",
  });
}

export function listStructures(projectId: string) {
  return apiFetch<ProjectStructure[]>(
    `/api/v1/rov/projects/${projectId}/structures`,
  );
}

export function createStructure(projectId: string, input: CreateStructureInput) {
  return apiFetch<ProjectStructure>(
    `/api/v1/rov/projects/${projectId}/structures`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateStructure(
  projectId: string,
  structureId: string,
  input: Partial<CreateStructureInput & { diagramPath?: string; photoPath?: string }>,
) {
  return apiFetch<ProjectStructure>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteStructure(projectId: string, structureId: string) {
  return apiFetch(`/api/v1/rov/projects/${projectId}/structures/${structureId}`, {
    method: "DELETE",
  });
}

export async function uploadStructureDiagram(
  projectId: string,
  structureId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/diagram`,
    { method: "POST", body: formData, credentials: "include" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "Upload failed");
  }
  return response.json() as Promise<ProjectStructure>;
}

export async function uploadStructurePhoto(
  projectId: string,
  structureId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/photo`,
    { method: "POST", body: formData, credentials: "include" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "Upload failed");
  }
  return response.json() as Promise<ProjectStructure>;
}

export function listViews(projectId: string, structureId: string) {
  return apiFetch<InspectionView[]>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views`,
  );
}

export function createView(
  projectId: string,
  structureId: string,
  input: { name: string; viewType?: "rov" | "diver" },
) {
  return apiFetch<InspectionView>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function listPoints(
  projectId: string,
  structureId: string,
  viewId: string,
) {
  return apiFetch<InspectionPoint[]>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views/${viewId}/points`,
  );
}

export function listAllPoints(projectId: string) {
  return apiFetch<InspectionPoint[]>(`/api/v1/rov/projects/${projectId}/points`);
}

export function createPoint(
  projectId: string,
  structureId: string,
  viewId: string,
  input: {
    xCoordinate: number;
    yCoordinate: number;
    severity?: string;
    findingType?: string;
    description?: string;
    diveLocation?: string;
    depthM?: string;
    dimensionMm?: string;
    recommendations?: string;
  },
) {
  return apiFetch<InspectionPoint>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views/${viewId}/points`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updatePoint(
  projectId: string,
  structureId: string,
  viewId: string,
  pointId: string,
  input: Record<string, unknown>,
) {
  return apiFetch<InspectionPoint>(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views/${viewId}/points/${pointId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deletePoint(
  projectId: string,
  structureId: string,
  viewId: string,
  pointId: string,
) {
  return apiFetch(
    `/api/v1/rov/projects/${projectId}/structures/${structureId}/views/${viewId}/points/${pointId}`,
    { method: "DELETE" },
  );
}

export function listMedia(projectId: string, structureId?: string) {
  return apiFetch<InspectionMedia[]>(
    `/api/v1/rov/projects/${projectId}/media${toQuery({ structureId })}`,
  );
}

export function createMedia(projectId: string, input: CreateMediaInput) {
  return apiFetch<InspectionMedia>(`/api/v1/rov/projects/${projectId}/media`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMedia(
  projectId: string,
  mediaId: string,
  input: { inspectionPointId?: string | null; fileName?: string },
) {
  return apiFetch<InspectionMedia>(
    `/api/v1/rov/media/${mediaId}${toQuery({ projectId })}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteMedia(projectId: string, mediaId: string) {
  return apiFetch(`/api/v1/rov/media/${mediaId}${toQuery({ projectId })}`, {
    method: "DELETE",
  });
}

export async function s3CreateUpload(filename: string, contentType: string) {
  return apiFetch<{ key: string; uploadId: string }>(
    "/api/v1/rov/s3-multipart/create",
    { method: "POST", body: JSON.stringify({ filename, contentType }) },
  );
}

export async function s3SignPart(
  key: string,
  uploadId: string,
  partNumber: number,
) {
  return apiFetch<{ url: string }>("/api/v1/rov/s3-multipart/sign", {
    method: "POST",
    body: JSON.stringify({ key, uploadId, partNumber }),
  });
}

export async function s3UploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  chunk: Blob,
) {
  const formData = new FormData();
  formData.append("key", key);
  formData.append("uploadId", uploadId);
  formData.append("partNumber", String(partNumber));
  formData.append("file", chunk);

  const response = await fetch("/api/v1/rov/s3-multipart/upload-part", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(", ")
          : "Part upload failed";
    throw new Error(message);
  }

  return response.json() as Promise<{ etag: string }>;
}

export async function s3CompleteUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  return apiFetch<{ key: string }>("/api/v1/rov/s3-multipart/complete", {
    method: "POST",
    body: JSON.stringify({ key, uploadId, parts }),
  });
}

export async function s3AbortUpload(key: string, uploadId: string) {
  return apiFetch("/api/v1/rov/s3-multipart/abort", {
    method: "POST",
    body: JSON.stringify({ key, uploadId }),
  });
}

export function listReports(projectId?: string) {
  return apiFetch<InspectionReport[]>(
    projectId
      ? `/api/v1/rov/projects/${projectId}/reports`
      : `/api/v1/rov/reports`,
  );
}

export function getReport(reportId: string) {
  return apiFetch<InspectionReport>(`/api/v1/rov/reports/${reportId}`);
}

export function createReport(projectId: string, input: CreateReportInput) {
  return apiFetch<InspectionReport>(
    `/api/v1/rov/projects/${projectId}/reports`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateReport(reportId: string, input: Partial<CreateReportInput>) {
  return apiFetch<InspectionReport>(`/api/v1/rov/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function generateShareLink(reportId: string) {
  return apiFetch<InspectionReport>(
    `/api/v1/rov/reports/${reportId}/share-link`,
    { method: "POST" },
  );
}

export function getPublicReport(hash: string) {
  return apiFetch<PublicReportPayload>(`/api/v1/public/report/${hash}`);
}

export function getPublicReportPdfUrl(hash: string) {
  return `/api/v1/public/report/${hash}/pdf`;
}
