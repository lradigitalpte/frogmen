export function clampCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function clampPointCoordinates<
  T extends { xCoordinate?: number; yCoordinate?: number },
>(input: T): T {
  const result = { ...input };

  if (result.xCoordinate !== undefined) {
    result.xCoordinate = clampCoordinate(result.xCoordinate);
  }

  if (result.yCoordinate !== undefined) {
    result.yCoordinate = clampCoordinate(result.yCoordinate);
  }

  return result;
}
