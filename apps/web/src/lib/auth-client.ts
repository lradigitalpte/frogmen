import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getClientAppOrigin } from "./app-origin";

export const authClient = createAuthClient({
  baseURL: getClientAppOrigin(),
  plugins: [organizationClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  updateUser,
  changePassword,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  requestPasswordReset,
  resetPassword,
} = authClient;
