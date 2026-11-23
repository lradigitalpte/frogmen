"use client";

import { Badge, Button, Icon, Modal, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { LocationIcon, SearchIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/providers/toast-provider";
import { deletePoint, listAllPoints, updatePoint } from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import type { InspectionPoint, InspectionSeverity } from "@/types/rov";
import { EditObservationModal } from "./edit-observation-modal";
import {
  draftToUpdateInput,
  draftsEqual,
  pointToDraft,
  type ObservationPointDraft,
} from "./observation-point-form";

interface ManageObservationsTabProps {
  projectId: string;
  onChanged?: () => void;
}

const SEVERITY: Record<InspectionSeverity, { label: string; tone: "critical" | "warning" | "info"; rank: number }> = {
  major: { label: "Major", tone: "critical", rank: 0 },
  moderate: { label: "Moderate", tone: "warning", rank: 1 },
  minor: { label: "Minor", tone: "info", rank: 2 },
};

type Filter = "all" | InspectionSeverity | "unrated" | "incomplete";
type Sort = "severity" | "id" | "structure" | "newest";

const SORTS = [
  { label: "Severity, major first", value: "severity" },
  { label: "Observation ID", value: "id" },
  { label: "Structure", value: "structure" },
  { label: "Newest first", value: "newest" },
];

function isIncomplete(p: InspectionPoint) {
  return !p.severity || !p.findingType?.trim() || !p.description?.trim();
}

function missingBits(p: InspectionPoint) {
  const out: string[] = [];
  if (!p.severity) out.push("severity");
  if (!p.findingType?.trim()) out.push("finding type");
  if (!p.description?.trim()) out.push("description");
  return out;
}

function idNumber(p: InspectionPoint) {
  return Number.parseInt((p.observationId ?? "").replace(/\D/g, ""), 10) || p.pointNumber || 0;
}

export function ManageObservationsTab({ projectId, onChanged }: ManageObservationsTabProps) {
  const { showSuccess } = useToast();
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [structureFilter, setStructureFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("severity");

  const [editingPoint, setEditingPoint] = useState<InspectionPoint | null>(null);
  const [draft, setDraft] = useState<ObservationPointDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ObservationPointDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionPoint | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPoints(await listAllPoints(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load observations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: points.length, major: 0, moderate: 0, minor: 0, unrated: 0, incomplete: 0, noMedia: 0 };
    for (const p of points) {
      if (p.severity) c[p.severity] += 1;
      else c.unrated += 1;
      if (isIncomplete(p)) c.incomplete += 1;
      if ((p.mediaCount ?? 0) === 0) c.noMedia += 1;
    }
    return c;
  }, [points]);

  const structureOptions = useMemo(() => {
    const seen = new Map<string, { name: string; sort: number; n: number }>();
    for (const p of points) {
      if (!p.structureId) continue;
      const row = seen.get(p.structureId) ?? { name: p.structureName ?? "Structure", sort: p.structureSort ?? 0, n: 0 };
      row.n += 1;
      seen.set(p.structureId, row);
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || a[1].name.localeCompare(b[1].name))
      .map(([id, s]) => ({ value: id, label: `${s.name} (${s.n})` }));
  }, [points]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = points.filter((p) => {
      if (filter === "unrated" && p.severity) return false;
      if (filter === "incomplete" && !isIncomplete(p)) return false;
      if ((filter === "major" || filter === "moderate" || filter === "minor") && p.severity !== filter) return false;
      if (structureFilter !== "all" && p.structureId !== structureFilter) return false;
      if (!q) return true;
      return [p.observationId, p.label, p.findingType, p.description, p.diveLocation, p.structureName, p.viewName, p.recommendations]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const bySeverity = (p: InspectionPoint) => (p.severity ? SEVERITY[p.severity].rank : 3);
    const byStructure = (a: InspectionPoint, b: InspectionPoint) =>
      (a.structureSort ?? 0) - (b.structureSort ?? 0) || (a.structureName ?? "").localeCompare(b.structureName ?? "");
    return rows.sort((a, b) => {
      if (sort === "severity") return bySeverity(a) - bySeverity(b) || idNumber(a) - idNumber(b);
      if (sort === "structure") return byStructure(a, b) || idNumber(a) - idNumber(b);
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      return idNumber(a) - idNumber(b);
    });
  }, [filter, points, query, sort, structureFilter]);

  const openEdit = (point: InspectionPoint) => {
    const nextDraft = pointToDraft(point);
    setModalError(null);
    setEditingPoint(point);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
  };

  const clearEdit = () => {
    setEditingPoint(null);
    setDraft(null);
    setSavedDraft(null);
    setModalError(null);
  };

  const closeEdit = () => {
    const dirty = draft !== null && savedDraft !== null && !draftsEqual(draft, savedDraft);
    if (dirty && !confirm("You have unsaved changes. Close without saving?")) return;
    clearEdit();
  };

  const handleSave = async () => {
    if (!editingPoint || !draft) return;
    const { structureId, inspectionViewId: viewId } = editingPoint;
    if (!structureId || !viewId) {
      setModalError("This observation is missing structure or view details.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await updatePoint(projectId, structureId, viewId, editingPoint.id, draftToUpdateInput(draft));
      await load();
      showSuccess(`${editingPoint.observationId ?? "Observation"} saved`);
      clearEdit();
      onChanged?.();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not save the observation");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { structureId, inspectionViewId: viewId } = deleteTarget;
    if (!structureId || !viewId) {
      setError("This observation is missing structure or view details.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deletePoint(projectId, structureId, viewId, deleteTarget.id);
      showSuccess(`${deleteTarget.observationId ?? "Observation"} deleted`);
      setDeleteTarget(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the observation");
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (point: InspectionPoint) => {
    clearEdit();
    setDeleteTarget(point);
  };

  const annotateUrl = (p: InspectionPoint) =>
    `/dashboard/rov/projects/${projectId}/structures/${p.structureId}/annotate?view=${p.inspectionViewId}&point=${p.id}`;

  const total = Math.max(1, counts.all);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "major", label: "Major", count: counts.major },
    { id: "moderate", label: "Moderate", count: counts.moderate },
    { id: "minor", label: "Minor", count: counts.minor },
    { id: "unrated", label: "Not rated", count: counts.unrated },
    { id: "incomplete", label: "Needs details", count: counts.incomplete },
  ];
  const filtered = filter !== "all" || structureFilter !== "all" || query.trim() !== "";

  return (
    <div className="rov-ob">
      {error ? (
        <div className="ac-error">
          {error}{" "}
          <button className="st-link" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {/* ── Severity summary ── */}
      {counts.all > 0 ? (
        <section className="rov-ob__summary">
          <div className="rov-ob__summary-main">
            <span className="rov-ob__summary-label">Findings</span>
            <strong>{counts.all}</strong>
            <small>
              {counts.major > 0 ? `${counts.major} need${counts.major === 1 ? "s" : ""} urgent action` : "No major findings"}
            </small>
          </div>
          <div className="rov-ob__summary-bar">
            <div className="rov-ob__bar">
              <b className="is-major" style={{ width: `${(counts.major / total) * 100}%` }} />
              <b className="is-moderate" style={{ width: `${(counts.moderate / total) * 100}%` }} />
              <b className="is-minor" style={{ width: `${(counts.minor / total) * 100}%` }} />
              <b className="is-none" style={{ width: `${(counts.unrated / total) * 100}%` }} />
            </div>
            <div className="rov-an__legend rov-ob__legend">
              {(["major", "moderate", "minor"] as const).map((key) => (
                <span key={key}>
                  <i className={`rov-an__swatch is-${key}`} /> {SEVERITY[key].label} <strong>{counts[key]}</strong>
                </span>
              ))}
              <span>
                <i className="rov-an__swatch is-none" /> Not rated <strong>{counts.unrated}</strong>
              </span>
            </div>
          </div>
          <div className="rov-ob__checks">
            <span className={cn(counts.incomplete === 0 && "is-ok")}>
              <i className={cn("st-dot", counts.incomplete === 0 ? "is-ok" : "is-low")} />
              {counts.incomplete === 0
                ? "All findings described"
                : `${counts.incomplete} missing details`}
            </span>
            <span className={cn(counts.noMedia === 0 && "is-ok")}>
              <i className={cn("st-dot", counts.noMedia === 0 ? "is-ok" : "is-muted")} />
              {counts.noMedia === 0 ? "Every finding has media" : `${counts.noMedia} without photos or video`}
            </span>
          </div>
        </section>
      ) : null}

      {/* ── List ── */}
      <section className="ex-surface">
        <div className="st-toolbar rov-ob__toolbar">
          <div className="iv-filters" role="tablist" aria-label="Filter by severity">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={cn("iv-filter", filter === f.id && "is-active")}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span>{f.count}</span>
              </button>
            ))}
          </div>
          <div className="st-toolbar__controls">
            <TextField
              label="Search observations"
              labelHidden
              autoComplete="off"
              placeholder="Search ID, finding, notes…"
              prefix={<Icon source={SearchIcon} tone="subdued" />}
              value={query}
              onChange={setQuery}
              clearButton
              onClearButtonClick={() => setQuery("")}
            />
            {structureOptions.length > 1 ? (
              <Select
                label="Structure"
                labelHidden
                options={[{ label: "All structures", value: "all" }, ...structureOptions]}
                value={structureFilter}
                onChange={setStructureFilter}
              />
            ) : null}
            <Select label="Sort" labelHidden options={SORTS} value={sort} onChange={(v) => setSort(v as Sort)} />
          </div>
        </div>

        {loading && points.length === 0 ? (
          <div className="ex-pad">
            <SkeletonBodyText lines={6} />
          </div>
        ) : points.length === 0 ? (
          <div className="ex-empty">
            <span className="ex-empty__icon">
              <Icon source={LocationIcon} />
            </span>
            <strong>No observations yet</strong>
            <p>Open a structure from the Structures tab and choose Annotate to drop pins on its diagram.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="ex-empty">
            <strong>No observations match</strong>
            <p>Try another filter or clear the search.</p>
            {filtered ? (
              <Button
                onClick={() => {
                  setFilter("all");
                  setStructureFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className={cn("ex-list", loading && "st-dim")}>
            {visible.map((p) => {
              const sev = p.severity ? SEVERITY[p.severity] : null;
              const missing = missingBits(p);
              const label = p.label && p.label !== p.observationId ? p.label : null;
              const title = p.findingType?.trim() || label || null;
              const media = p.mediaCount ?? 0;
              const facts = [
                p.diveLocation,
                p.depthM ? `${p.depthM} m deep` : null,
                p.dimensionMm ? `${p.dimensionMm} mm` : null,
              ].filter(Boolean);
              return (
                <li className="rov-ob__row" key={p.id}>
                  <b className={cn("rov-an__pin is-lg", p.severity ? `is-${p.severity}` : "is-none")}>
                    {p.observationId?.replace(/^O/, "") ?? "•"}
                  </b>

                  <div className="rov-ob__main">
                    <div className="rov-ob__title">
                      <button type="button" className="rov-ob__open" onClick={() => openEdit(p)}>
                        {p.observationId ?? "Observation"}
                        {title ? <span> · {title}</span> : null}
                      </button>
                      {sev ? <Badge tone={sev.tone}>{sev.label}</Badge> : <Badge>Not rated</Badge>}
                    </div>
                    <small className="rov-ob__where">
                      {p.structureName ?? "Structure"} · {p.viewName ?? "View"}
                      {facts.length ? ` · ${facts.join(" · ")}` : ""}
                    </small>
                    {p.description?.trim() ? (
                      <p className="rov-ob__desc">{p.description}</p>
                    ) : null}
                    {missing.length > 0 ? (
                      <small className="rov-ob__missing">Missing {missing.join(", ")}</small>
                    ) : null}
                  </div>

                  <div className="rov-ob__media">
                    <strong>{media}</strong>
                    <small>{media === 1 ? "media file" : "media files"}</small>
                  </div>

                  <div className="rov-ob__actions">
                    <Button size="slim" url={annotateUrl(p)} icon={LocationIcon}>
                      On diagram
                    </Button>
                    <Button size="slim" variant={missing.length ? "primary" : undefined} onClick={() => openEdit(p)}>
                      {missing.length ? "Complete" : "Edit"}
                    </Button>
                    <Button size="slim" variant="plain" tone="critical" onClick={() => requestDelete(p)}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {points.length > 0 ? (
          <p className="pl-foot rov-ob__foot">
            Showing {visible.length} of {points.length} observation{points.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      <EditObservationModal
        open={editingPoint !== null}
        point={editingPoint}
        draft={draft}
        savedDraft={savedDraft}
        saving={saving}
        error={modalError}
        onDraftChange={setDraft}
        onClose={closeEdit}
        onSave={() => void handleSave()}
        onReset={() => savedDraft && setDraft(savedDraft)}
        onDelete={() => editingPoint && requestDelete(editingPoint)}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.observationId ?? "observation"}?`}
        primaryAction={{
          content: "Delete observation",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null), disabled: deleting }]}
      >
        <Modal.Section>
          <Text as="p">
            The pin and its finding details are removed. Linked media stays in the project library and can be attached
            to another observation. This can&apos;t be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </div>
  );
}
