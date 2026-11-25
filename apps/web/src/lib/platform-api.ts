import { apiFetch } from "./api";

export interface PlatformOrganizationMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  ownerEmails: string[];
  members: PlatformOrganizationMember[];
}

export interface DeleteOrganizationResult {
  deletedOrganizationId: string;
  name: string;
  slug: string;
  deletedOrphanUsers: number;
}

export interface ResetOrganizationPasswordResult {
  userId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  mustChangePassword: boolean;
}

export const listPlatformOrganizations = () =>
  apiFetch<PlatformOrganization[]>("/api/v1/platform/organizations");

export const deletePlatformOrganization = (
  id: string,
  confirmSlug: string,
) =>
  apiFetch<DeleteOrganizationResult>(`/api/v1/platform/organizations/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmSlug }),
  });

export const resetPlatformOrganizationUserPassword = (
  organizationId: string,
  userId: string,
) =>
  apiFetch<ResetOrganizationPasswordResult>(
    `/api/v1/platform/organizations/${organizationId}/members/${userId}/reset-password`,
    { method: "POST" },
  );

export interface PlatformBackup {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  status: "running" | "ready" | "failed";
  sizeBytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  error: string | null;
  createdByEmail: string | null;
  createdAt: string;
  lastDownloadedAt: string | null;
  lastDownloadedByEmail: string | null;
}

export const listPlatformBackups = () =>
  apiFetch<PlatformBackup[]>("/api/v1/platform/backups");

export const startPlatformBackup = (organizationId: string) =>
  apiFetch<PlatformBackup>(
    `/api/v1/platform/organizations/${organizationId}/backups`,
    { method: "POST" },
  );

export const deletePlatformBackup = (id: string) =>
  apiFetch(`/api/v1/platform/backups/${id}`, { method: "DELETE" });

export const platformBackupDownloadUrl = (id: string) =>
  `/api/v1/platform/backups/${id}/download`;
