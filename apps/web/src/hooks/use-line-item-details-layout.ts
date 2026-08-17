"use client";

import { useEffect, useState } from "react";
import type { LineItemDetailsLayout } from "@frog1/shared";
import { getDocumentTemplates } from "@/lib/settings-api";

let cachedLayout: LineItemDetailsLayout | undefined;
let inflight: Promise<LineItemDetailsLayout> | null = null;

function loadLayout() {
  if (!inflight) {
    inflight = getDocumentTemplates()
      .then((templates) => {
        cachedLayout = templates.lineItemDetailsLayout ?? "bullets";
        return cachedLayout;
      })
      .catch(() => {
        cachedLayout = "bullets";
        return cachedLayout;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function useLineItemDetailsLayout(
  override?: LineItemDetailsLayout,
): LineItemDetailsLayout {
  const [layout, setLayout] = useState<LineItemDetailsLayout>(
    override ?? cachedLayout ?? "bullets",
  );

  useEffect(() => {
    if (override) {
      setLayout(override);
      return;
    }

    let cancelled = false;
    void loadLayout().then((value) => {
      if (!cancelled) {
        setLayout(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [override]);

  return layout;
}
