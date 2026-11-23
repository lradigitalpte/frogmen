"use client";

import {
  Badge,
  Button,
  Checkbox,
  Form,
  Icon,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { DesktopIcon, LockIcon, MobileIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { changePassword, listSessions, revokeOtherSessions, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 8;

interface AccountSession {
  id: string;
  updatedAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function deviceName(agent?: string | null) {
  const v = agent ?? "";
  const browser = /Edg\//.test(v)
    ? "Edge"
    : /Chrome\//.test(v)
      ? "Chrome"
      : /Firefox\//.test(v)
        ? "Firefox"
        : /Safari\//.test(v)
          ? "Safari"
          : "Browser";
  const os = /Windows/i.test(v)
    ? "Windows"
    : /Android/i.test(v)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(v)
        ? "iOS"
        : /Mac OS/i.test(v)
          ? "macOS"
          : /Linux/i.test(v)
            ? "Linux"
            : "Unknown device";
  return { label: `${browser} on ${os}`, mobile: /Mobile|Android|iPhone|iPad/i.test(v) };
}

function lastActive(value: string | Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(value).toLocaleDateString();
}

const STRENGTH = [
  { label: "Too weak", tone: "is-weak" },
  { label: "Weak", tone: "is-weak" },
  { label: "Fair", tone: "is-fair" },
  { label: "Good", tone: "is-good" },
  { label: "Strong", tone: "is-strong" },
];

export default function ProfileSecurityPage() {
  const { data: session, isPending } = useSession();
  const { showSuccess, showError } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentError, setCurrentError] = useState<string | undefined>();

  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadSessions = useCallback(async () => {
    const result = await listSessions();
    setSessions(result.error ? null : ((result.data ?? []) as AccountSession[]));
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const user = session?.user;
  const currentId = session?.session?.id;

  const checks = useMemo(
    () => [
      { label: `At least ${MIN_LENGTH} characters`, passed: newPassword.length >= MIN_LENGTH },
      { label: "Upper and lowercase letters", passed: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
      { label: "A number", passed: /\d/.test(newPassword) },
      { label: "A symbol", passed: /[^A-Za-z0-9]/.test(newPassword) },
    ],
    [newPassword],
  );
  const score = newPassword ? checks.filter((c) => c.passed).length + (newPassword.length >= 14 ? 1 : 0) : 0;
  const strength = STRENGTH[Math.min(score, 4)];

  const sameAsCurrent = Boolean(newPassword) && newPassword === currentPassword;
  const mismatch = Boolean(confirmPassword) && confirmPassword !== newPassword;
  const dirty = Boolean(currentPassword || newPassword || confirmPassword);
  const valid =
    Boolean(currentPassword) && newPassword.length >= MIN_LENGTH && !sameAsCurrent && newPassword === confirmPassword;

  const others = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.id !== currentId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [currentId, sessions],
  );
  // The list API is capped, so the current session may be missing from it — always show this device first.
  const thisDevice: AccountSession | null = session?.session
    ? {
        id: session.session.id,
        updatedAt: session.session.updatedAt,
        ipAddress: session.session.ipAddress,
        userAgent: session.session.userAgent,
      }
    : null;
  const sorted = thisDevice ? [thisDevice, ...others] : others;
  const deviceCount = sessions ? others.length + 1 : null;

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentError(undefined);
    setShow(false);
  }

  async function handleChangePassword() {
    if (!valid || saving) return;
    setSaving(true);
    setCurrentError(undefined);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: signOutOthers,
      });
      if (result.error) {
        const message = result.error.message ?? "Couldn't change your password";
        if (/invalid password|incorrect/i.test(message)) setCurrentError("That isn't your current password");
        else showError(message);
        return;
      }
      reset();
      showSuccess(signOutOthers && others.length ? "Password updated · other devices signed out" : "Password updated");
      void loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't change your password");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutOthers() {
    setRevoking(true);
    const result = await revokeOtherSessions();
    if (result.error) showError(result.error.message ?? "Couldn't sign out other devices");
    else showSuccess("Other devices signed out");
    await loadSessions();
    setRevoking(false);
  }

  const showToggle = (
    <Button variant="plain" onClick={() => setShow((v) => !v)}>
      {show ? "Hide" : "Show"}
    </Button>
  );

  if (isPending || !mounted) {
    return (
      <AppPage title="Password & security">
        <div className="prf">
          <section className="prf-hero">
            <SkeletonBodyText lines={3} />
          </section>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage fullWidth title="Password & security" subtitle="Your password and the devices signed in to your account.">
      <div className="prf">
        {/* ── Status ── */}
        <section className="prf-hero sec-hero">
          <span className="sec-hero__icon">
            <Icon source={LockIcon} />
          </span>
          <div className="prf-hero__main">
            <span className="prf-hero__label">Account security</span>
            <h2>
              {others.length > 2
                ? `Signed in on ${others.length + 1} devices`
                : user?.emailVerified === false
                  ? "Your email isn't verified yet"
                  : "Your account is protected"}
            </h2>
            <p>
              {others.length > 2
                ? "If you don't recognise all of them, change your password and sign the others out."
                : "Use a password you don't use anywhere else, and sign out devices you no longer use."}
            </p>
            <div className="prf-hero__facts">
              <span>
                <b>Signed in as</b> {user?.email}
              </span>
              <span>
                <b>Devices</b> {deviceCount ?? "—"}
              </span>
              <span>
                <b>Email</b> {user?.emailVerified ? "Verified" : "Not verified"}
              </span>
            </div>
          </div>
        </section>

        <div className="prf-grid">
          {/* ── Change password ── */}
          <section className="ex-surface prf-card">
            <header className="prf-card__head">
              <h3>Change password</h3>
              <p>Enter your current password, then choose a new one.</p>
            </header>
            <Form onSubmit={() => void handleChangePassword()}>
              {/* Tells password managers which account this is, so they don't fill the top-bar search. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={user?.email ?? ""}
                readOnly
                hidden
              />
              <div className="prf-card__body">
                <TextField
                  autoComplete="current-password"
                  label="Current password"
                  type={show ? "text" : "password"}
                  value={currentPassword}
                  onChange={(v) => {
                    setCurrentPassword(v);
                    setCurrentError(undefined);
                  }}
                  error={currentError}
                  suffix={showToggle}
                  disabled={saving}
                />

                <div className="sec-new">
                  <TextField
                    autoComplete="new-password"
                    label="New password"
                    type={show ? "text" : "password"}
                    value={newPassword}
                    onChange={setNewPassword}
                    error={sameAsCurrent ? "Choose a password different from your current one" : undefined}
                    disabled={saving}
                  />
                  <TextField
                    autoComplete="new-password"
                    label="Confirm new password"
                    type={show ? "text" : "password"}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    error={mismatch ? "Passwords don't match" : undefined}
                    disabled={saving}
                  />
                </div>

                <div className={cn("sec-meter", newPassword && strength.tone)}>
                  <div className="sec-meter__head">
                    <span>Password strength</span>
                    <strong>{newPassword ? strength.label : "—"}</strong>
                  </div>
                  <div className="sec-meter__bar" aria-hidden>
                    {[1, 2, 3, 4].map((n) => (
                      <i key={n} className={cn(score >= n && "is-on")} />
                    ))}
                  </div>
                  <ul className="sec-meter__checks">
                    {checks.map((c) => (
                      <li key={c.label} className={cn(c.passed && "is-ok")}>
                        <i className={cn("st-dot", c.passed ? "is-ok" : "is-muted")} />
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <Checkbox
                  checked={signOutOthers}
                  label="Sign out of other devices"
                  helpText={
                    others.length
                      ? `Recommended. ${others.length} other device${others.length === 1 ? "" : "s"} will need the new password. This one stays signed in.`
                      : "Recommended. This device stays signed in."
                  }
                  onChange={setSignOutOthers}
                  disabled={saving}
                />
              </div>
              <footer className="prf-card__foot">
                <Text as="span" tone="subdued" variant="bodySm">
                  {valid ? "Ready to update" : `At least ${MIN_LENGTH} characters`}
                </Text>
                <span className="prf-card__actions">
                  <Button disabled={!dirty || saving} onClick={reset}>
                    Clear
                  </Button>
                  <Button submit variant="primary" loading={saving} disabled={!valid}>
                    Update password
                  </Button>
                </span>
              </footer>
            </Form>
          </section>

          {/* ── Devices ── */}
          <div className="prf-side">
            <section className="ex-surface prf-card">
              <header className="prf-card__head sec-card-head">
                <span>
                  <h3>Signed-in devices</h3>
                  <p>Where your account is open right now.</p>
                </span>
                {deviceCount ? <Badge tone={others.length > 2 ? "attention" : undefined}>{String(deviceCount)}</Badge> : null}
              </header>
              {sessions === null ? (
                <div className="prf-card__body">
                  <SkeletonBodyText lines={3} />
                </div>
              ) : (
                <ul className="sec-devices">
                  {sorted.slice(0, 4).map((s) => {
                    const d = deviceName(s.userAgent);
                    const isThis = s.id === currentId;
                    return (
                      <li key={s.id}>
                        <span className="sec-devices__icon">
                          <Icon source={d.mobile ? MobileIcon : DesktopIcon} />
                        </span>
                        <span className="sec-devices__main">
                          <b>{d.label}</b>
                          <small>
                            {isThis ? "This device" : lastActive(s.updatedAt)}
                            {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                          </small>
                        </span>
                        {isThis ? <Badge tone="success">Current</Badge> : null}
                      </li>
                    );
                  })}
                  {sorted.length > 4 ? <li className="sec-devices__more">+{sorted.length - 4} more</li> : null}
                </ul>
              )}
              <footer className="prf-links sec-links">
                <NextLink href="/dashboard/profile/sessions">Manage sessions →</NextLink>
                {others.length ? (
                  <Button variant="plain" tone="critical" loading={revoking} onClick={() => void handleSignOutOthers()}>
                    {`Sign out ${others.length} other${others.length === 1 ? "" : "s"}`}
                  </Button>
                ) : null}
              </footer>
            </section>

            <section className="ex-surface prf-card">
              <header className="prf-card__head">
                <h3>Good habits</h3>
              </header>
              <ul className="sec-tips">
                <li>Use a password you don&apos;t use for any other site — a password manager makes this easy.</li>
                <li>Sign out of shared or office computers when you&apos;re done.</li>
                <li>
                  Forgot your current password? <NextLink href="/forgot-password">Reset it by email</NextLink>.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
