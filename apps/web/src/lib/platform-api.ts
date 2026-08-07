import { apiFetch } from "./api";

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  ownerEmails: string[];
}

export interface DeleteOrganizationResult {
  deletedOrganizationId: string;
  name: string;
  slug: string;
  deletedOrphanUsers: number;
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
