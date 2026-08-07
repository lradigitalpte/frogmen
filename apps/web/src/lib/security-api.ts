import { apiFetch } from "./api";

export type AppRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "staff"
  | "viewer";

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  documentPrefix: string;
  timezone: string;
  isMain: boolean;
  isActive: boolean;
}

export interface SecurityContext {
  organizationId: string;
  userId: string;
  memberId: string;
  role: AppRole;
  permissions: string[];
  branchScope: "single" | "all";
  activeBranchId: string | null;
  branches: Branch[];
  canAccessAllBranches: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    mustChangePassword?: boolean;
  };
  security: SecurityContext | null;
  isPlatformAdmin?: boolean;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  branches: Array<{
    branchId: string;
    branchName: string;
    isPrimary: boolean;
  }>;
}

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: AppRole;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  expiresAt: string;
  createdAt: string;
  inviterName: string;
  branches: Array<{
    invitationId: string;
    branchId: string;
    branchName: string;
  }>;
}

export interface InvitationDelivery {
  delivered: boolean;
  mode: "smtp" | "resend" | "log" | "error" | "skipped";
  error?: string;
}

export interface InvitationMutation {
  id: string;
  email: string;
  delivery: InvitationDelivery;
}

export interface ProvisionedMember {
  userId: string;
  memberId: string;
  email: string;
  name: string;
  role: AppRole;
  branchIds: string[];
  temporaryPassword: string;
  loginUrl: string;
  delivery: InvitationDelivery;
}

export interface AuditLog {
  id: string;
  branchId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  branchName: string | null;
  action: string;
  resource: string;
  recordId: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  data: AuditLog[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export const getMe = () => apiFetch<MeResponse>("/api/v1/me");
export const setInitialPassword = (newPassword: string) =>
  apiFetch<{ success: boolean }>("/api/v1/me/set-initial-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
export const listBranches = () => apiFetch<Branch[]>("/api/v1/branches");
export const createBranch = (body: {
  name: string;
  code: string;
  documentPrefix?: string;
  timezone?: string;
}) =>
  apiFetch<Branch>("/api/v1/branches", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateBranch = (id: string, body: Partial<Branch>) =>
  apiFetch<Branch>(`/api/v1/branches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const deactivateBranch = (id: string) =>
  apiFetch<Branch>(`/api/v1/branches/${id}`, { method: "DELETE" });
export const selectBranch = (body: {
  mode: "single" | "all";
  branchId?: string | null;
}) =>
  apiFetch<{ mode: "single" | "all"; branchId: string | null }>(
    "/api/v1/branches/select",
    { method: "POST", body: JSON.stringify(body) },
  );
export const listMembers = () =>
  apiFetch<OrganizationMember[]>("/api/v1/members");
export const updateMember = (
  id: string,
  body: { role?: AppRole; branchIds?: string[]; primaryBranchId?: string },
) =>
  apiFetch<OrganizationMember[]>(`/api/v1/members/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const inviteMember = (body: {
  email: string;
  role: AppRole;
  branchIds: string[];
}) =>
  apiFetch<InvitationMutation>("/api/v1/members/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const provisionMember = (body: {
  name: string;
  email: string;
  role: AppRole;
  branchIds: string[];
  sendEmail?: boolean;
}) =>
  apiFetch<ProvisionedMember>("/api/v1/members/provision", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const listInvitations = () =>
  apiFetch<OrganizationInvitation[]>("/api/v1/members/invitations");
export const resendInvitation = (id: string) =>
  apiFetch<InvitationMutation>(`/api/v1/members/invitations/${id}/resend`, {
    method: "POST",
  });
export const cancelInvitation = (id: string) =>
  apiFetch(`/api/v1/members/invitations/${id}`, {
    method: "DELETE",
  });
export const listAuditLogs = (page = 1, perPage = 25) =>
  apiFetch<AuditLogPage>(
    `/api/v1/audit-logs?page=${page}&perPage=${perPage}`,
  );
