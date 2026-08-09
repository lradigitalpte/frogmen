const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export function textToSignatureDataUrl(text: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare signature canvas");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1e293b";
  ctx.font = "italic 42px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL("image/png");
}

export async function readSignatureUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload a PNG or JPG signature image");
  }

  if (file.size > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature image must be 2 MB or smaller");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read signature file"));
    reader.readAsDataURL(file);
  });

  return dataUrl;
}

export function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;

  const pixelBuffer = new Uint32Array(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
  );
  return !pixelBuffer.some((color) => color !== 0);
}
