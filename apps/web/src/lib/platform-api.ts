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
