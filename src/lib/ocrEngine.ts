import { recognize } from "tesseract.js";

export async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(1, Math.min(2.5, 1600 / Math.min(bitmap.width, bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تجهيز الصورة للقراءة.");

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrast = 1.35;
  const midpoint = 128;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const adjusted = Math.max(0, Math.min(255, (gray - midpoint) * contrast + midpoint));
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function extractTextFromImage(file: File, onProgress?: (progress: number, status: string) => void): Promise<string> {
  try {
    onProgress?.(5, "تجهيز الصورة...");
    const processed = await preprocessImage(file);
    const result = await recognize(processed, "ara+eng", {
      logger: (message) => {
        const progress = Math.round((message.progress ?? 0) * 100);
        onProgress?.(progress, message.status || "جاري قراءة الصورة...");
      },
    });
    const text = result.data.text.trim();
    if (!text) throw new Error("لم يتم استخراج نص واضح من الصورة.");
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل OCR لسبب غير معروف.";
    throw new Error(`تعذر قراءة النص من الصورة: ${message}`);
  }
}
