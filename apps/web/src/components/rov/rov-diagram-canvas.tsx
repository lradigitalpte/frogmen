"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSeverity, severityColorMap, severityPinColor } from "@frog1/shared";
import {
  clampCoordinate,
  computeImageBoundingBox,
  type ImageBoundingBox,
  screenToImagePercent,
} from "@/lib/rov-diagram-coordinates";

export interface DiagramCanvasPoint {
  id: string;
  xCoordinate: number | null;
  yCoordinate: number | null;
  observationId?: string | null;
  severity?: string | null;
}

const DEFAULT_SEVERITY_COLORS = severityColorMap();

interface RovDiagramCanvasProps {
  imageSrc: string | null;
  points: DiagramCanvasPoint[];
  selectedPointId?: string | null;
  mode: "view" | "annotate";
  addMode?: boolean;
  severityColors?: Record<string, string>;
  emptyLabel?: string;
  onPlacePin?: (x: number, y: number) => void;
  onSelectPin?: (pointId: string) => void;
  onMovePin?: (pointId: string, x: number, y: number) => void;
}

export function RovDiagramCanvas({
  imageSrc,
  points,
  selectedPointId,
  mode,
  addMode = false,
  severityColors = DEFAULT_SEVERITY_COLORS,
  emptyLabel = "No diagram",
  onPlacePin,
  onSelectPin,
  onMovePin,
}: RovDiagramCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [bbox, setBbox] = useState<ImageBoundingBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState<{
    pointId: string;
    x: number;
    y: number;
  } | null>(null);

  const updateBbox = useCallback(() => {
    const frame = frameRef.current;
    if (!frame || naturalSize.width <= 0 || naturalSize.height <= 0) return;

    const rect = frame.getBoundingClientRect();
    setBbox(
      computeImageBoundingBox(
        rect.width,
        rect.height,
        naturalSize.width,
        naturalSize.height,
      ),
    );
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    updateBbox();
    const frame = frameRef.current;
    if (!frame) return;

    const observer = new ResizeObserver(() => updateBbox());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [updateBbox]);

  const resolveCoords = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame || bbox.width <= 0 || bbox.height <= 0) return null;
      return screenToImagePercent(
        clientX,
        clientY,
        frame.getBoundingClientRect(),
        bbox,
      );
    },
    [bbox],
  );

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== "annotate" || !addMode || dragState) return;
      const coords = resolveCoords(event.clientX, event.clientY);
      if (!coords) return;
      onPlacePin?.(coords.x, coords.y);
    },
    [addMode, dragState, mode, onPlacePin, resolveCoords],
  );

  const handlePinPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      point: DiagramCanvasPoint,
    ) => {
      event.stopPropagation();
      onSelectPin?.(point.id);

      if (mode !== "annotate" || !onMovePin) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        pointId: point.id,
        x: point.xCoordinate ?? 0,
        y: point.yCoordinate ?? 0,
      });
    },
    [mode, onMovePin, onSelectPin],
  );

  const handlePinPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragState) return;
      const coords = resolveCoords(event.clientX, event.clientY);
      if (!coords) return;
      setDragState({ pointId: dragState.pointId, ...coords });
    },
    [dragState, resolveCoords],
  );

  const handlePinPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragState) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      onMovePin?.(dragState.pointId, dragState.x, dragState.y);
      setDragState(null);
    },
    [dragState, onMovePin],
  );

  const displayPoints = points.map((point) => {
    if (dragState?.pointId === point.id) {
      return {
        ...point,
        xCoordinate: dragState.x,
        yCoordinate: dragState.y,
      };
    }
    return point;
  });

  const overlayReady = bbox.width > 0 && bbox.height > 0;

  return (
    <div className="rov-diagram-canvas">
      <div ref={frameRef} className="rov-diagram-canvas__frame">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Inspection diagram"
            className="rov-diagram-canvas__image"
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget;
              setNaturalSize({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }}
          />
        ) : (
          <div className="rov-diagram-canvas__empty">{emptyLabel}</div>
        )}

        {imageSrc && overlayReady ? (
          <div
            className={`rov-diagram-canvas__overlay${
              mode === "annotate" && addMode ? " rov-diagram-canvas__overlay--add" : ""
            }`}
            style={{
              left: bbox.x,
              top: bbox.y,
              width: bbox.width,
              height: bbox.height,
            }}
            onClick={handleOverlayClick}
          >
            {displayPoints.map((point) => {
              const x = clampCoordinate(point.xCoordinate ?? 0);
              const y = clampCoordinate(point.yCoordinate ?? 0);
              const severityKey = normalizeSeverity(point.severity) ?? "minor";
              const color = severityColors[severityKey] ?? severityPinColor(severityKey);
              const isSelected = selectedPointId === point.id;

              return (
                <button
                  key={point.id}
                  type="button"
                  className={`rov-diagram-canvas__pin${
                    isSelected ? " rov-diagram-canvas__pin--selected" : ""
                  }${mode === "view" ? " rov-diagram-canvas__pin--view" : ""}`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    ["--pin-color" as string]: color,
                  }}
                  title={point.observationId ?? undefined}
                  onPointerDown={(event) => handlePinPointerDown(event, point)}
                  onPointerMove={handlePinPointerMove}
                  onPointerUp={handlePinPointerUp}
                  onPointerCancel={handlePinPointerUp}
                >
                  <span className="rov-diagram-canvas__pin-label">
                    {point.observationId?.replace("O", "") ?? "•"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
