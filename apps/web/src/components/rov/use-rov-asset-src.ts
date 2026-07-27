"use client";

import { useEffect, useState } from "react";
import { rovAssetUrl } from "@/lib/rov-api";

export function useRovAssetSrc(path: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const assetUrl = rovAssetUrl(path);
    if (!assetUrl) {
      setSrc(null);
      setFailed(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(assetUrl, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Failed to load asset (${response.status})`);
        }

        const blob = await response.blob();
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) {
          setSrc(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path]);

  return { src, failed };
}
