export interface ImageBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** object-fit: contain rect inside a container */
export function computeImageBoundingBox(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageBoundingBox {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const containerRatio = containerWidth / containerHeight;
  const imageRatio = naturalWidth / naturalHeight;

  let width: number;
  let height: number;

  if (imageRatio > containerRatio) {
    width = containerWidth;
    height = containerWidth / imageRatio;
  } else {
    height = containerHeight;
    width = containerHeight * imageRatio;
  }

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

/** Screen position → image-relative % (0–100). Returns null if outside the image rect. */
export function screenToImagePercent(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  bbox: ImageBoundingBox,
): { x: number; y: number } | null {
  if (bbox.width <= 0 || bbox.height <= 0) return null;

  const localX = clientX - containerRect.left - bbox.x;
  const localY = clientY - containerRect.top - bbox.y;

  if (localX < 0 || localY < 0 || localX > bbox.width || localY > bbox.height) {
    return null;
  }

  return {
    x: clampCoordinate((localX / bbox.width) * 100),
    y: clampCoordinate((localY / bbox.height) * 100),
  };
}

export function imagePercentToOverlayStyle(x: number, y: number) {
  return {
    left: `${x}%`,
    top: `${y}%`,
  };
}
