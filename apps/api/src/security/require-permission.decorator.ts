import { SetMetadata } from "@nestjs/common";
import type { Permission } from "./permissions";

export const PERMISSION_METADATA = "frog1:permission";

/** Require a permission. Passing several means any one of them is enough. */
export const RequirePermission = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(PERMISSION_METADATA, permissions.length === 1 ? permissions[0] : permissions);
