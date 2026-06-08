export type PreprocessVariant =
  | "original"
  | "grayscale"
  | "highContrast"
  | "adaptiveThreshold"
  | "sharpened"
  | "denoised"
  | "weakDevice"
  | "textFocused";

export interface ProcessedImageVariant {
  variant: PreprocessVariant;
  blob: Blob;
  width: number;
  height: number;
  description: string;
  warnings: string[];
}

export interface PreprocessingPipelineResult {
  variants: ProcessedImageVariant[];
  recommendedVariant: PreprocessVariant;
  warnings: string[];
}

type DeviceTier = "weak" | "medium" | "strong";

interface VariantConfig {
  variant: PreprocessVariant;
  maxWidth: number;
  grayscale?: boolean;
  contrast?: number;
  threshold?: boolean;
  sharpen?: boolean;
  denoise?: boolean;
  quality?: number;
  description: string;
}

const variantDescriptions: Record<PreprocessVariant, string> = {
  original: "الصورة الأصلية بعد تحويل آمن إلى نسخة قابلة للقراءة.",
  grayscale: "تحويل رمادي لتقليل تشويش الألوان.",
  highContrast: "رمادي مع تباين أعلى للنص الباهت.",
  adaptiveThreshold: "أبيض وأسود مبسط للخلفيات الورقية الرمادية.",
  sharpened: "زيادة حدة خفيفة للصور الناعمة.",
  denoised: "تنظيف ضجيج خفيف مع الحفاظ على النص.",
  weakDevice: "نسخة مصغرة ومحسوبة للأجهزة الضعيفة.",
  textFocused: "نسخة مركزة على النص: رمادي، تباين، حدة خفيفة، وحجم مناسب.",
};

function targetVariants(deviceTier: DeviceTier): PreprocessVariant[] {
  if (deviceTier === "weak") return ["weakDevice", "highContrast", "textFocused"];
  if (deviceTier === "medium") return ["grayscale", "highContrast", "adaptiveThreshold", "textFocused"];
  return ["original", "grayscale", "highContrast", "adaptiveThreshold", "sharpened", "denoised", "weakDevice", "textFocused"];
}

function maxWidthFor(variant: PreprocessVariant, deviceTier: DeviceTier) {
  if (variant === "weakDevice") return 1000;
  if (variant === "textFocused") return deviceTier === "strong" ? 1800 : deviceTier === "medium" ? 1400 : 1000;
  if (deviceTier === "strong") return 1800;
  if (deviceTier === "medium") return 1400;
  return 1000;
}

function buildConfig(variant: PreprocessVariant, deviceTier: DeviceTier): VariantConfig {
  const maxWidth = maxWidthFor(variant, deviceTier);
  const base = { variant, maxWidth, description: variantDescriptions[variant] };
  switch (variant) {
    case "grayscale":
      return { ...base, grayscale: true, quality: 0.92 };
    case "highContrast":
      return { ...base, grayscale: true, contrast: 1.55, quality: 0.92 };
    case "adaptiveThreshold":
      return { ...base, grayscale: true, threshold: true, quality: 0.95 };
    case "sharpened":
      return { ...base, grayscale: true, contrast: 1.2, sharpen: true, quality: 0.92 };
    case "denoised":
      return { ...base, grayscale: true, denoise: true, contrast: 1.25, quality: 0.9 };
    case "weakDevice":
      return { ...base, grayscale: true, contrast: 1.35, quality: 0.88 };
    case "textFocused":
      return { ...base, grayscale: true, contrast: 1.45, sharpen: true, quality: 0.92 };
    default:
      return { ...base, quality: 0.92 };
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تجهيز الصورة للمعالجة.");
  return { canvas, ctx };
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

function applyGrayscaleAndContrast(imageData: ImageData, contrast = 1) {
  const data = imageData.data;
  const midpoint = 128;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const adjusted = clamp((gray - midpoint) * contrast + midpoint);
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }
}

function applyThreshold(imageData: ImageData) {
  const data = imageData.data;
  let total = 0;
  const pixels = data.length / 4;
  for (let index = 0; index < data.length; index += 4) total += data[index];
  const threshold = Math.max(105, Math.min(180, total / pixels));
  for (let index = 0; index < data.length; index += 4) {
    const value = data[index] > threshold ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
}

function applySharpen(imageData: ImageData, width: number, height: number) {
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      let kernelIndex = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const offset = ((y + ky) * width + (x + kx)) * 4;
          sum += source[offset] * kernel[kernelIndex];
          kernelIndex += 1;
        }
      }
      const offset = (y * width + x) * 4;
      const value = clamp(sum);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
}

function applyDenoise(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const temporary = document.createElement("canvas");
  temporary.width = canvas.width;
  temporary.height = canvas.height;
  const temporaryCtx = temporary.getContext("2d");
  if (!temporaryCtx) return;
  temporaryCtx.drawImage(canvas, 0, 0);
  ctx.filter = "blur(0.6px)";
  ctx.drawImage(temporary, 0, 0);
  ctx.filter = "none";
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("تعذر إنتاج نسخة الصورة المحسنة."));
    }, "image/jpeg", quality);
  });
}

async function processVariant(bitmap: ImageBitmap, config: VariantConfig): Promise<ProcessedImageVariant> {
  const scale = Math.min(1, config.maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const warnings: string[] = [];
  const { canvas, ctx } = createCanvas(width, height);

  ctx.drawImage(bitmap, 0, 0, width, height);
  if (config.denoise) applyDenoise(ctx, canvas);

  if (config.grayscale || config.contrast || config.threshold || config.sharpen) {
    const imageData = ctx.getImageData(0, 0, width, height);
    if (config.grayscale || config.contrast) applyGrayscaleAndContrast(imageData, config.contrast ?? 1);
    if (config.threshold) applyThreshold(imageData);
    if (config.sharpen) applySharpen(imageData, width, height);
    ctx.putImageData(imageData, 0, 0);
  }

  if (bitmap.width > width) warnings.push(`تم تصغير الصورة إلى عرض ${width}px لتخفيف الحمل.`);
  const blob = await canvasToBlob(canvas, config.quality);
  return { variant: config.variant, blob, width, height, description: config.description, warnings };
}

export async function createPreprocessingVariants(
  file: File,
  deviceTier: DeviceTier
): Promise<PreprocessingPipelineResult> {
  const bitmap = await createImageBitmap(file);
  const warnings: string[] = [];
  const variantsToRun = targetVariants(deviceTier);
  if (deviceTier === "weak") warnings.push("تم استخدام وضع خفيف مناسب للأجهزة الضعيفة.");

  const variants: ProcessedImageVariant[] = [];
  for (const variant of variantsToRun) {
    variants.push(await processVariant(bitmap, buildConfig(variant, deviceTier)));
  }

  return {
    variants,
    recommendedVariant: deviceTier === "weak" ? "weakDevice" : "textFocused",
    warnings,
  };
}
