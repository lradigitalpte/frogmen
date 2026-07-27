import type { AppRole, Permission } from "./permissions";

export interface SecurityBranch {
  id: string;
  name: string;
  code: string;
  documentPrefix: string;
  isMain: boolean;
}

export interface SecurityContext {
  organizationId: string;
  userId: string;
  memberId: string;
  role: AppRole;
  permissions: readonly Permission[];
  branchScope: "single" | "all";
  activeBranchId: string | null;
  branches: SecurityBranch[];
  canAccessAllBranches: boolean;
}
