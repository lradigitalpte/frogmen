export function getProductImageUrl(imagePath: string | null | undefined) {
  if (!imagePath) {
    return undefined;
  }

  const segments = imagePath.split("/");

  if (segments.length < 4 || segments[0] !== "products") {
    return undefined;
  }

  const [, organizationId, productId, ...rest] = segments;
  const fileName = rest.join("/");

  return `/api/v1/files/products/${organizationId}/${productId}/${fileName}`;
}
