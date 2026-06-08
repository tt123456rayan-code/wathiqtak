import { recognize } from "tesseract.js";
import { createPreprocessingVariants, type PreprocessVariant } from "./imagePreprocessingPipeline";

type DeviceTier = "weak" | "medium" | "strong";
const OCR_PASS_TIMEOUT_MS = 45_000;

export interface MultiPassOcrResult {
  bestText: string;
  rawResults: Array<{
    variant: string;
    text: string;
    score: number;
    warnings: string[];
  }>;
  selectedVariant: string;
  warnings: string[];
}

const governmentTerms = [
  "وزارة",
  "مديرية",
  "محافظة",
  "رقم الكتاب",
  "رقم المعاملة",
  "هام وعاجل",
  "تزويدي",
  "كشوفات",
  "اعتراض",
  "استكمال",
  "مرفقات",
  "بالسرعة الممكنة",
];

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

function scoreOcrText(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;

  const arabicMatches = normalized.match(/[\u0600-\u06ff]/g) ?? [];
  const randomSymbols = normalized.match(/[^\s\w\u0600-\u06ff،؛:./()\-]/g) ?? [];
  const usefulLines = normalized.split(/\n+/).filter((line) => {
    const trimmed = line.trim();
    return trimmed.length >= 8 && /[\u0600-\u06ffA-Za-z0-9]/.test(trimmed);
  });
  const termHits = governmentTerms.filter((term) => normalized.includes(term)).length;
  const numberHits = normalized.match(/\d{2,}|[٠-٩]{2,}/g)?.length ?? 0;
  const arabicRatio = arabicMatches.length / Math.max(1, normalized.replace(/\s/g, "").length);

  return Math.round(
    Math.min(normalized.length, 1400) * 0.06
    + arabicRatio * 90
    + termHits * 22
    + usefulLines.length * 8
    + Math.min(numberHits, 8) * 5
    - randomSymbols.length * 3
  );
}

function isImportantGovernmentLine(line: string) {
  const trimmed = line.trim();
  if (trimmed.length < 12) return false;
  if (!/[\u0600-\u06ff]/.test(trimmed)) return false;
  if ((trimmed.match(/[^\s\w\u0600-\u06ff،؛:./()\-]/g) ?? []).length > 3) return false;
  return governmentTerms.some((term) => trimmed.includes(term)) || /رقم|تاريخ|مرفق|موظف|كشف|مهلة/.test(trimmed);
}

export function mergeOcrCandidates(results: MultiPassOcrResult["rawResults"]) {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const bestText = sorted[0]?.text.trim() ?? "";
  const mergedLines = bestText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const mergedText = mergedLines.join("\n");

  for (const candidate of sorted.slice(1, 3)) {
    for (const line of candidate.text.split(/\n+/)) {
      const trimmed = line.trim();
      if (isImportantGovernmentLine(trimmed) && !mergedText.includes(trimmed) && !mergedLines.includes(trimmed)) {
        mergedLines.push(trimmed);
      }
    }
  }

  return mergedLines.join("\n").trim();
}

async function recognizeVariant(
  blob: Blob,
  variant: PreprocessVariant,
  index: number,
  total: number,
  signal?: AbortSignal,
  onProgress?: (progress: number, status: string) => void
) {
  if (signal?.aborted) throw new Error("تم إيقاف القراءة.");

  const label = {
    original: "الصورة الأصلية",
    grayscale: "النسخة الرمادية",
    highContrast: "نسخة عالية التباين",
    adaptiveThreshold: "نسخة أبيض وأسود",
    sharpened: "نسخة محسّنة الحدة",
    denoised: "نسخة تقليل الضجيج",
    weakDevice: "نسخة الجهاز الضعيف",
    textFocused: "نسخة مركزة للنص",
  }[variant];

  const statusPrefix = `الطبقة ${index + 1} من ${total}:`;
  let passActive = true;
  const recognizePromise = recognize(blob, "ara+eng", {
    logger: (message) => {
      if (!passActive || signal?.aborted) return;
      const stepProgress = message.progress ?? 0;
      const base = (index / total) * 88;
      const progress = Math.round(8 + base + stepProgress * (88 / total));
      onProgress?.(progress, `${statusPrefix} تجربة ${label}...`);
    },
  });

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    window.setTimeout(() => resolve("timeout"), OCR_PASS_TIMEOUT_MS);
  });
  const abortPromise = new Promise<"aborted">((resolve) => {
    signal?.addEventListener("abort", () => resolve("aborted"), { once: true });
  });

  const result = await Promise.race([recognizePromise, timeoutPromise, abortPromise]);
  passActive = false;
  if (result === "aborted") throw new Error("تم إيقاف القراءة.");
  if (result === "timeout") {
    return {
      text: "",
      score: 0,
      warning: `تم تجاهل طبقة ${variant} لأنها تجاوزت 45 ثانية.`,
    };
  }

  const text = result.data.text.trim();
  return { text, score: scoreOcrText(text), warning: "" };
}

export async function extractTextMultiPass(
  file: File,
  options: {
    deviceTier: DeviceTier;
    signal?: AbortSignal;
    onProgress?: (progress: number, status: string) => void;
  }
): Promise<MultiPassOcrResult> {
  try {
    if (options.signal?.aborted) throw new Error("تم إيقاف القراءة.");
    options.onProgress?.(5, "تجهيز الصورة...");
    const pipeline = await createPreprocessingVariants(file, options.deviceTier);
    const rawResults: MultiPassOcrResult["rawResults"] = [];

    for (let index = 0; index < pipeline.variants.length; index += 1) {
      if (options.signal?.aborted) throw new Error("تم إيقاف القراءة.");
      const item = pipeline.variants[index];
      const result = await recognizeVariant(item.blob, item.variant, index, pipeline.variants.length, options.signal, options.onProgress);
      rawResults.push({
        variant: item.variant,
        text: result.text,
        score: result.score,
        warnings: result.warning ? [...item.warnings, result.warning] : item.warnings,
      });
    }

    rawResults.sort((a, b) => b.score - a.score);
    const selected = rawResults[0];
    if (!selected?.text.trim()) throw new Error("لم نتمكن من استخراج نص موثوق. جرّب صورة أوضح أو أدخل النص يدويًا.");

    options.onProgress?.(96, "اختيار أفضل قراءة...");
    const bestText = mergeOcrCandidates(rawResults);
    options.onProgress?.(100, "تم اختيار أفضل قراءة.");

    return {
      bestText,
      rawResults,
      selectedVariant: selected.variant,
      warnings: pipeline.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل OCR متعدد الطبقات لسبب غير معروف.";
    throw new Error(`تعذر تشغيل القراءة متعددة الطبقات: ${message}`);
  }
}
