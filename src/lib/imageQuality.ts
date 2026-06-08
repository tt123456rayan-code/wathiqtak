export type ImageQualityLevel = "poor" | "acceptable" | "good";

export interface ImageQualityReport {
  level: ImageQualityLevel;
  score: number;
  warnings: string[];
  suggestions: string[];
  metrics: {
    width: number;
    height: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    fileSizeKb: number;
  };
}

async function fileToCanvas(file: File, maxWidth = 1400): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر قراءة الصورة.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function grayscaleValues(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const values: number[] = [];
  for (let index = 0; index < data.length; index += 16) {
    values.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  return values;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values: number[], mean: number) {
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}

function laplacianSharpness(canvas: HTMLCanvasElement): number {
  const sampleCanvas = document.createElement("canvas");
  const max = 360;
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  sampleCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  sampleCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) return 0;
  sampleCtx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const values = grayscaleValues(sampleCanvas);
  const width = sampleCanvas.width;
  const height = sampleCanvas.height;
  const responses: number[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const response = Math.abs(values[i - width] + values[i - 1] - 4 * values[i] + values[i + 1] + values[i + width]);
      responses.push(response);
    }
  }

  return average(responses);
}

export async function analyzeDocumentImageQuality(file: File): Promise<ImageQualityReport> {
  const canvas = await fileToCanvas(file);
  const gray = grayscaleValues(canvas);
  const brightness = average(gray);
  const contrast = standardDeviation(gray, brightness);
  const sharpness = laplacianSharpness(canvas);
  const fileSizeKb = Math.round(file.size / 1024);
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  if (canvas.width < 900 || canvas.height < 900) {
    warnings.push("الصورة صغيرة وقد لا تظهر الحروف بوضوح.");
    suggestions.push("قرّب الكاميرا من النص أو استخدم دقة أعلى.");
    score -= 22;
  }
  if (brightness < 75) {
    warnings.push("الصورة داكنة جدًا.");
    suggestions.push("صوّر الورقة بإضاءة مباشرة وواضحة.");
    score -= 18;
  }
  if (brightness > 220) {
    warnings.push("الصورة فاتحة جدًا وقد تضيع تفاصيل النص.");
    suggestions.push("خفف الإضاءة المباشرة أو غيّر زاوية التصوير.");
    score -= 14;
  }
  if (contrast < 32) {
    warnings.push("التباين منخفض بين النص والخلفية.");
    suggestions.push("ضع الورقة على سطح ثابت وحاول زيادة وضوح النص.");
    score -= 18;
  }
  if (sharpness < 7) {
    warnings.push("الصورة تبدو مهتزة أو غير حادة.");
    suggestions.push("ثبّت الهاتف واجعل الورقة مستقيمة قدر الإمكان.");
    score -= 24;
  }
  if (fileSizeKb > 6500) {
    warnings.push("حجم الصورة كبير وقد يبطئ OCR على الهواتف الضعيفة.");
    suggestions.push("سيتم تجهيز نسخة أخف قبل القراءة عند الحاجة.");
    score -= 8;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level: ImageQualityLevel = normalizedScore >= 78 ? "good" : normalizedScore >= 52 ? "acceptable" : "poor";

  if (!suggestions.length) {
    suggestions.push("الصورة مناسبة للقراءة. راجع النص المستخرج قبل إنشاء الرد.");
  }

  return {
    level,
    score: normalizedScore,
    warnings,
    suggestions,
    metrics: {
      width: canvas.width,
      height: canvas.height,
      brightness: Math.round(brightness),
      contrast: Math.round(contrast),
      sharpness: Math.round(sharpness),
      fileSizeKb,
    },
  };
}

export async function prepareImageForWeakDevice(file: File, maxWidth = 1000): Promise<Blob> {
  const canvas = await fileToCanvas(file, maxWidth);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تجهيز الصورة للهواتف الضعيفة.");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));
    data[index] = enhanced;
    data[index + 1] = enhanced;
    data[index + 2] = enhanced;
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("تعذر ضغط الصورة."));
      else resolve(blob);
    }, "image/jpeg", 0.88);
  });
}
