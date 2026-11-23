"use client";

import {
  Badge,
  Button,
  DropZone,
  Form,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
  TextField,
} from "@shopify/polaris";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { updateUser, useSession } from "@/lib/auth-client";
import { getMe, type SecurityContext } from "@/lib/security-api";

const NAME_MAX = 80;
const AVATAR_PX = 256;

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"
  );
}

function roleLabel(role?: string) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function memberSince(value: unknown) {
  if (!value) return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** Square-crop and shrink to a small JPEG so it can live on the user record. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be read"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process the image");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProfileInformationPage() {
  const { data: session, isPending } = useSession();
  const { showSuccess, showError } = useToast();
  const [security, setSecurity] = useState<SecurityContext | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pickPhoto, setPickPhoto] = useState(false);
  // The server has no session; match its skeleton on the first client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const user = session?.user;
  const savedName = user?.name ?? "";
  const image = user?.image ?? null;

  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  useEffect(() => {
    void getMe()
      .then((r) => setSecurity(r.security))
      .catch(() => setSecurity(null));
  }, []);

  const trimmed = name.trim();
  const dirty = trimmed !== savedName.trim();
  const nameError = !trimmed ? "Enter your name" : trimmed.length > NAME_MAX ? `Keep it under ${NAME_MAX} characters` : undefined;
  const previewName = trimmed || savedName || "Your name";
  const initials = useMemo(() => initialsOf(previewName), [previewName]);

  const handleSave = useCallback(async () => {
    if (!dirty || nameError) return;
    setSaving(true);
    try {
      const result = await updateUser({ name: trimmed });
      if (result.error) {
        showError(result.error.message ?? "Could not update your name");
        return;
      }
      showSuccess("Name updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not update your name");
    } finally {
      setSaving(false);
    }
  }, [dirty, nameError, showError, showSuccess, trimmed]);

  const savePhoto = useCallback(
    async (next: string | null) => {
      setPhotoBusy(true);
      try {
        const result = await updateUser({ image: next });
        if (result.error) {
          showError(result.error.message ?? "Could not update your photo");
          return;
        }
        showSuccess(next ? "Photo updated" : "Photo removed");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not update your photo");
      } finally {
        setPhotoBusy(false);
      }
    },
    [showError, showSuccess],
  );

  const handleDrop = useCallback(
    async (_all: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) {
        showError("Choose a JPG, PNG or WebP image.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showError("That image is over 10 MB. Choose a smaller one.");
        return;
      }
      try {
        await savePhoto(await toAvatarDataUrl(file));
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not read that image");
      }
    },
    [savePhoto, showError],
  );

  const branches = security?.branches ?? [];
  const activeBranch = branches.find((b) => b.id === security?.activeBranchId) ?? null;
  const since = memberSince(user?.createdAt);

  if (isPending || !mounted) {
    return (
      <AppPage title="Profile information">
        <div className="prf">
          <section className="prf-hero">
            <SkeletonDisplayText size="medium" />
            <SkeletonBodyText lines={2} />
          </section>
          <section className="ex-surface ex-pad">
            <SkeletonBodyText lines={6} />
          </section>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage fullWidth title="Profile information" subtitle="How you appear to your team across FrogmenDash.">
      <div className="prf">
        {/* ── Identity ── */}
        <section className="prf-hero">
          <div className="prf-hero__avatar">
            <DropZone
              accept="image/*"
              type="image"
              allowMultiple={false}
              disabled={photoBusy}
              openFileDialog={pickPhoto}
              onFileDialogClose={() => setPickPhoto(false)}
              onDrop={(all, accepted) => void handleDrop(all, accepted)}
              outline={false}
              label="Profile photo"
              labelHidden
            >
              <span className="prf-avatar" aria-busy={photoBusy}>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={image} />
                ) : (
                  <span>{initials}</span>
                )}
                <span className="prf-avatar__hover">{photoBusy ? "Saving…" : image ? "Change" : "Add photo"}</span>
              </span>
            </DropZone>
          </div>

          <div className="prf-hero__main">
            <span className="prf-hero__label">Signed in as</span>
            <h2>{previewName}</h2>
            <p>
              {user?.email}
              {user?.emailVerified ? <span className="prf-chip is-ok">Verified</span> : null}
            </p>
            <div className="prf-hero__facts">
              <span>
                <b>Role</b> {roleLabel(security?.role)}
              </span>
              <span>
                <b>Branch</b>{" "}
                {security?.canAccessAllBranches
                  ? "All branches"
                  : activeBranch?.name ?? (branches.length ? branches.map((b) => b.name).join(", ") : "—")}
              </span>
              {since ? (
                <span>
                  <b>Member since</b> {since}
                </span>
              ) : null}
            </div>
          </div>

          <div className="prf-hero__photo-actions">
            <Button loading={photoBusy} onClick={() => setPickPhoto(true)}>
              {image ? "Change photo" : "Upload photo"}
            </Button>
            {image ? (
              <Button variant="plain" tone="critical" disabled={photoBusy} onClick={() => void savePhoto(null)}>
                Remove
              </Button>
            ) : null}
          </div>
        </section>

        <div className="prf-grid">
          <div className="prf-side">
          {/* ── Name ── */}
          <section className="ex-surface prf-card">
            <header className="prf-card__head">
              <h3>Display name</h3>
              <p>Shown on tasks, approvals, documents and activity history.</p>
            </header>
            <Form onSubmit={() => void handleSave()}>
              <div className="prf-card__body">
                <TextField
                  autoComplete="name"
                  label="Full name"
                  value={name}
                  onChange={setName}
                  maxLength={NAME_MAX}
                  showCharacterCount={trimmed.length > NAME_MAX - 20}
                  error={dirty ? nameError : undefined}
                  disabled={saving}
                />
                <div className="prf-preview">
                  <span className="prf-preview__label">Preview</span>
                  <span className="prf-preview__chip">
                    <span className="prf-preview__avatar">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={image} />
                      ) : (
                        initials
                      )}
                    </span>
                    <span>
                      <strong>{previewName}</strong>
                      <small>Assigned you a task · just now</small>
                    </span>
                  </span>
                </div>
              </div>
              <footer className="prf-card__foot">
                <Text as="span" tone="subdued" variant="bodySm">
                  {dirty ? "You have unsaved changes" : "Up to date"}
                </Text>
                <span className="prf-card__actions">
                  <Button disabled={!dirty || saving} onClick={() => setName(savedName)}>
                    Discard
                  </Button>
                  <Button submit variant="primary" loading={saving} disabled={!dirty || Boolean(nameError)}>
                    Save
                  </Button>
                </span>
              </footer>
            </Form>
          </section>

          </div>

          {/* ── Sign-in & access ── */}
          <div className="prf-side">
            <section className="ex-surface prf-card">
              <header className="prf-card__head">
                <h3>Sign-in email</h3>
                <p>Used to sign in and receive notifications.</p>
              </header>
              <div className="prf-card__body">
                <div className="prf-row">
                  <span className="prf-row__value">{user?.email}</span>
                  {user?.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="attention">Not verified</Badge>}
                </div>
                <Text as="p" tone="subdued" variant="bodySm">
                  To change it, ask an organization owner or admin.
                </Text>
              </div>
            </section>

            <section className="ex-surface prf-card">
              <header className="prf-card__head">
                <h3>Access</h3>
                <p>Set by your organization&apos;s admins.</p>
              </header>
              <dl className="prf-facts">
                <div>
                  <dt>Role</dt>
                  <dd>
                    <Badge tone={security?.role === "owner" || security?.role === "admin" ? "info" : undefined}>
                      {roleLabel(security?.role)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>Branches</dt>
                  <dd>
                    {security?.canAccessAllBranches
                      ? `All branches (${branches.length})`
                      : branches.length
                        ? branches.map((b) => b.name).join(", ")
                        : "—"}
                  </dd>
                </div>
                {activeBranch ? (
                  <div>
                    <dt>Working in</dt>
                    <dd>{activeBranch.name}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Permissions</dt>
                  <dd>{security ? `${security.permissions.length} granted` : "—"}</dd>
                </div>
              </dl>
              <footer className="prf-links">
                <NextLink href="/dashboard/profile/security">Password &amp; security →</NextLink>
                <NextLink href="/dashboard/profile/sessions">Active sessions →</NextLink>
              </footer>
            </section>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
