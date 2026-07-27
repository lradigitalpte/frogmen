"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  useSession,
} from "@/lib/auth-client";
import { Globe2, Laptop, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface AccountSession {
  id: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function deviceDetails(agent?: string | null) {
  const value = agent ?? "";
  const mobile = /Mobile|Android|iPhone|iPad/i.test(value);
  const browser = /Edg\//.test(value)
    ? "Microsoft Edge"
    : /Chrome\//.test(value)
      ? "Google Chrome"
      : /Firefox\//.test(value)
        ? "Mozilla Firefox"
        : /Safari\//.test(value)
          ? "Safari"
          : "Unknown browser";
  const os = /Windows/i.test(value)
    ? "Windows"
    : /Android/i.test(value)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(value)
        ? "iOS"
        : /Mac OS/i.test(value)
          ? "macOS"
          : /Linux/i.test(value)
            ? "Linux"
            : "Unknown device";
  return { browser, os, mobile };
}

function relativeDate(value: string | Date) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return date.toLocaleString();
}

export default function ActiveSessionsPage() {
  const { data: currentSession } = useSession();
  const { showSuccess, showError } = useToast();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listSessions();
    if (result.error) {
      setError(result.error.message ?? "Failed to load active sessions");
      setSessions([]);
    } else {
      setSessions((result.data ?? []) as AccountSession[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(token: string) {
    setRevokingToken(token);
    const result = await revokeSession({ token });
    if (result.error) showError(result.error.message ?? "Failed to revoke session");
    else {
      showSuccess("Device signed out.");
      await load();
    }
    setRevokingToken(null);
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    const result = await revokeOtherSessions();
    if (result.error) showError(result.error.message ?? "Failed to revoke other sessions");
    else {
      showSuccess("All other devices have been signed out.");
      await load();
    }
    setRevokingOthers(false);
  }

  const currentSessionId = currentSession?.session?.id;
  const otherCount = sessions.filter((session) => session.id !== currentSessionId).length;
  const deviceGroups = useMemo(() => {
    const groups = new Map<string, AccountSession[]>();
    for (const session of sessions) {
      const key = `${session.userAgent || "unknown"}|${session.ipAddress || "unknown"}`;
      groups.set(key, [...(groups.get(key) ?? []), session]);
    }
    return [...groups.values()].map((group) => {
      const sorted = [...group].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
      const current = sorted.find((session) => session.id === currentSessionId);
      return {
        sessions: sorted,
        representative: current ?? sorted[0]!,
        current: Boolean(current),
      };
    });
  }, [currentSessionId, sessions]);

  return (
    <AppPage
      title="Active sessions"
      subtitle="Review and control the devices signed in to your account."
    >
      <BlockStack gap="500">
        <section className="active-sessions-hero">
          <div className="active-sessions-hero__icon"><ShieldCheck size={27} /></div>
          <div>
            <span>Session security</span>
            <h2>{deviceGroups.length} recognized device{deviceGroups.length === 1 ? "" : "s"}</h2>
            <p>Sign out any device or location you do not recognize.</p>
          </div>
          <Button
            disabled={otherCount === 0}
            loading={revokingOthers}
            onClick={handleRevokeOthers}
          >
            Sign out other devices
          </Button>
        </section>

        {error ? <Banner tone="critical">{error}</Banner> : null}
        {loading ? (
          <InlineStack align="center"><Spinner /></InlineStack>
        ) : (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Signed-in devices</Text>
                <Text as="p" tone="subdued">Sessions automatically expire at the date shown below.</Text>
              </BlockStack>
              <div className="active-session-list">
                {deviceGroups.map((group) => {
                  const session = group.representative;
                  const current = group.current;
                  const device = deviceDetails(session.userAgent);
                  const DeviceIcon = device.mobile ? Smartphone : Laptop;
                  return (
                    <article className={`active-session-item${current ? " is-current" : ""}`} key={`${session.userAgent}-${session.ipAddress}`}>
                      <span className="active-session-item__device"><DeviceIcon size={22} /></span>
                      <div className="active-session-item__main">
                        <InlineStack gap="200" blockAlign="center">
                          <strong>{device.browser} on {device.os}</strong>
                          {current ? <Badge tone="success">This device</Badge> : null}
                          {group.sessions.length > 1 ? (
                            <Badge>{`${group.sessions.length} sign-ins`}</Badge>
                          ) : null}
                        </InlineStack>
                        <div className="active-session-item__meta">
                          <span><Globe2 size={13} />{session.ipAddress || "IP unavailable"}</span>
                          <span><MonitorSmartphone size={13} />Last active {relativeDate(session.updatedAt)}</span>
                        </div>
                        <small>
                          Expires {new Date(session.expiresAt).toLocaleString()}
                          {group.sessions.length > 1
                            ? ` • ${group.sessions.length - 1} older session${group.sessions.length === 2 ? "" : "s"} can be removed`
                            : ""}
                        </small>
                      </div>
                      {current ? (
                        <Text as="span" tone="success">Current session</Text>
                      ) : (
                        <Button
                          tone="critical"
                          loading={revokingToken === session.token}
                          onClick={() => void handleRevoke(session.token)}
                        >
                          Sign out
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </AppPage>
  );
}
