export type DeviceTier = "weak" | "medium" | "strong";
export type MobileOcrMode = "lite" | "balanced" | "pro";

export interface ImageProcessingPlan {
  maxImageWidth: number;
  splitIntoRegions: boolean;
  enhanceContrast: boolean;
  deskew: boolean;
  allowManualCorrection: boolean;
  expectedSpeed: string;
  expectedAccuracy: string;
}

export function detectDeviceTier(): DeviceTier {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const memory = navigatorWithMemory.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;

  if (memory <= 2 || cores <= 2) return "weak";
  if (memory >= 8 && cores >= 8) return "strong";
  return "medium";
}

export function selectMobileOcrMode(deviceTier: DeviceTier = detectDeviceTier()): MobileOcrMode {
  if (deviceTier === "weak") return "lite";
  if (deviceTier === "strong") return "pro";
  return "balanced";
}

export function buildImageProcessingPlan(mode: MobileOcrMode = selectMobileOcrMode()): ImageProcessingPlan {
  if (mode === "lite") {
    return {
      maxImageWidth: 1000,
      splitIntoRegions: true,
      enhanceContrast: true,
      deskew: false,
      allowManualCorrection: true,
      expectedSpeed: "الأسرع على الهواتف الضعيفة",
      expectedAccuracy: "جيدة للكتب الواضحة وتحتاج مراجعة يدوية",
    };
  }

  if (mode === "pro") {
    return {
      maxImageWidth: 1800,
      splitIntoRegions: false,
      enhanceContrast: true,
      deskew: true,
      allowManualCorrection: true,
      expectedSpeed: "أبطأ لكنه أشمل",
      expectedAccuracy: "الأعلى عند توفر جهاز قوي وصورة واضحة",
    };
  }

  return {
    maxImageWidth: 1400,
    splitIntoRegions: true,
    enhanceContrast: true,
    deskew: true,
    allowManualCorrection: true,
    expectedSpeed: "متوازن لمعظم الهواتف",
    expectedAccuracy: "مناسبة للعرض والاستخدام اليومي مع مراجعة سريعة",
  };
}
