"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRovAssetSrc } from "./use-rov-asset-src";

interface RovStructureImageProps {
  path: string | null | undefined;
  alt: string;
  className?: string;
  emptyClassName?: string;
  emptyLabel?: string;
}

export function RovStructureImage({
  path,
  alt,
  className = "rov-structure-thumb",
  emptyClassName = "rov-structure-thumb rov-structure-thumb--empty",
  emptyLabel = "No image",
}: RovStructureImageProps) {
  const { src, failed } = useRovAssetSrc(path);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [path]);

  if (!path || !src || failed || imgFailed) {
    return (
      <div className={emptyClassName}>
        <ImageIcon size={18} strokeWidth={1.75} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgFailed(true)}
    />
  );
}