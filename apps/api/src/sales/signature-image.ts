/** True for an embedded raster image; remote URLs and SVG are never accepted as a signature. */
export function isSignatureImage(value: string): boolean {
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.trim());
}
