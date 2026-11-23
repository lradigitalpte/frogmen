"use client";

import { Button, Icon, Text } from "@shopify/polaris";
import { LockIcon } from "@shopify/polaris-icons";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { allows, permissionLabel, roleLabel, routeRule, type AccessRule } from "@/lib/access";
import { getMe } from "@/lib/security-api";

interface AccessValue {
  /** False until /me has loaded; callers should not hide things before then. */
  ready: boolean;
  role: string | null;
  permissions: readonly string[];
  can: (rule: AccessRule) => boolean;
}

const AccessContext = createContext<AccessValue>({
  ready: false,
  role: null,
  permissions: [],
  can: () => true,
});

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; role: string | null; permissions: readonly string[] }>({
    ready: false,
    role: null,
    permissions: [],
  });

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setState({ ready: true, role: me.security?.role ?? null, permissions: me.security?.permissions ?? [] });
      })
      .catch(() => {
        // If /me fails, don't lock the UI — the API still enforces access.
        if (!cancelled) setState({ ready: false, role: null, permissions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AccessValue>(
    () => ({
      ...state,
      can: (rule) => !state.ready || allows(state.permissions, rule),
    }),
    [state],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  return useContext(AccessContext);
}

/** Shows a clear "no access" screen instead of a page full of permission errors. */
export function RouteAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, role, can } = useAccess();
  const rule = routeRule(pathname);

  if (!ready || can(rule)) return <>{children}</>;

  const needed = (typeof rule === "string" ? [rule] : rule ?? []).map(permissionLabel);
  return (
    <div className="acc-denied">
      <span className="acc-denied__icon">
        <Icon source={LockIcon} />
      </span>
      <Text as="h2" variant="headingLg">
        You don&apos;t have access to this page
      </Text>
      <p>
        Your role is <b>{roleLabel(role)}</b>. This page needs: <b>{needed.join(" or ")}</b>.
      </p>
      <p className="acc-denied__hint">Ask an owner or admin to change your role in Settings → Users &amp; roles.</p>
      <Button url="/dashboard" variant="primary">
        Back to home
      </Button>
    </div>
  );
}
