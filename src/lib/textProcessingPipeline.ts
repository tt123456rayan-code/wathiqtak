export type TextQualityLevel = "unreadable" | "needs-review" | "usable" | "strong";

export interface TextProcessingCorrection {
  from: string;
  to: string;
  reason: string;
}

export interface TextProcessingResult {
  inputText: string;
  processedText: string;
  corrections: TextProcessingCorrection[];
  removedNoiseLines: string[];
  recognizedSignals: string[];
  warnings: string[];
  blockers: string[];
  qualityScore: number;
  qualityLevel: TextQualityLevel;
}

const signalTerms = [
  "وزارة",
  "دائرة",
  "إدارة",
  "مديرية",
  "محافظة",
  "بلدية",
  "أمانة",
  "محكمة",
  "جامعة",
  "مدرسة",
  "مستشفى",
  "رقم الكتاب",
  "رقم المعاملة",
  "الرقم الوطني",
  "رقم الوثيقة",
  "رقم الهاتف",
  "تاريخ",
  "نموذج",
  "شهادة",
  "وصل",
  "إيصال",
  "مخالفة",
  "غرامة",
  "استكمال",
  "رفض",
  "نواقص",
];

const joinedTermFixes: Array<[RegExp, string, string]> = [
  [/رقمالكتاب/g, "رقم الكتاب", "فصل تسمية حقل ملتصقة"],
  [/رقمالمعاملة/g, "رقم المعاملة", "فصل تسمية حقل ملتصقة"],
  [/رقمالطلب/g, "رقم الطلب", "فصل تسمية حقل ملتصقة"],
  [/الرقمالوطني/g, "الرقم الوطني", "فصل تسمية حقل حساس"],
  [/رقمالوثيقة/g, "رقم الوثيقة", "فصل تسمية حقل حساس"],
  [/رقمالهاتف/g, "رقم الهاتف", "فصل تسمية حقل حساس"],
  [/اسمالمشتري/g, "اسم المشتري", "فصل تسمية حقل نموذج"],
  [/اسمالمشترى/g, "اسم المشتري", "تصحيح وفصل تسمية حقل نموذج"],
  [/اسمالبائع/g, "اسم البائع", "فصل تسمية حقل نموذج"],
  [/تاريخالولادة/g, "تاريخ الولادة", "فصل تسمية حقل تاريخ"],
  [/تاريخالميلاد/g, "تاريخ الميلاد", "فصل تسمية حقل تاريخ"],
  [/نوعالوثيقة/g, "نوع الوثيقة", "فصل تسمية حقل"],
  [/رقمسند/g, "رقم سند", "فصل تسمية حقل"],
  [/نموذجنقلمركبة/g, "نموذج نقل مركبة", "فصل اسم نموذج حكومي"],
  [/ادارةترخيص/g, "إدارة ترخيص", "فصل اسم جهة حكومية"],
  [/ترخيصالسواقين/g, "ترخيص السواقين", "فصل اسم جهة حكومية"],
  [/السواقينوالمركبات/g, "السواقين والمركبات", "فصل اسم جهة حكومية"],
];

const ocrWordFixes: Array<[RegExp, string, string]> = [
  [/\bالحكوميه\b/g, "الحكومية", "تصحيح تاء مربوطة"],
  [/\bالمركبه\b/g, "المركبة", "تصحيح تاء مربوطة"],
  [/\bوثيقه\b/g, "وثيقة", "تصحيح تاء مربوطة"],
  [/\bرخصه\b/g, "رخصة", "تصحيح تاء مربوطة"],
  [/\bشهاده\b/g, "شهادة", "تصحيح تاء مربوطة"],
  [/\bجامعه\b/g, "جامعة", "تصحيح تاء مربوطة"],
  [/\bمدرسه\b/g, "مدرسة", "تصحيح تاء مربوطة"],
  [/\bمستشفي\b/g, "مستشفى", "تصحيح ألف مقصورة"],
  [/\bاحوال\b/g, "أحوال", "توحيد همزة"],
  [/\bادارة\b/g, "إدارة", "توحيد همزة"],
  [/\bاشعار\b/g, "إشعار", "توحيد همزة"],
  [/\bايصال\b/g, "إيصال", "توحيد همزة"],
  [/\bالى\b/g, "إلى", "توحيد همزة"],
  [/\bالمشترى\b/g, "المشتري", "توحيد صيغة الكلمة"],
  [/\bالوطنى\b/g, "الوطني", "تصحيح ياء"],
  [/\bالعاصمه\b/g, "العاصمة", "تصحيح تاء مربوطة"],
  [/\bالباتف\b/g, "الهاتف", "تصحيح خطأ OCR شائع"],
  [/\bنمودج\b/g, "نموذج", "تصحيح خطأ OCR شائع"],
  [/\bمركبه\b/g, "مركبة", "تصحيح تاء مربوطة"],
];

function normalizeDigits(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const persianIndex = persianDigits.indexOf(digit);
    return persianIndex >= 0 ? String(persianIndex) : digit;
  });
}

function applyFixes(text: string, fixes: Array<[RegExp, string, string]>, corrections: TextProcessingCorrection[]) {
  let next = text;
  for (const [pattern, replacement, reason] of fixes) {
    next = next.replace(pattern, (match) => {
      if (match !== replacement) corrections.push({ from: match, to: replacement, reason });
      return replacement;
    });
  }
  return next;
}

function isNoiseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const contentLength = trimmed.replace(/\s/g, "").length;
  if (contentLength < 3) return true;
  const lettersAndDigits = (trimmed.match(/[\u0600-\u06ffA-Za-z0-9]/g) ?? []).length;
  const symbols = (trimmed.match(/[^\s\u0600-\u06ffA-Za-z0-9،؛:./()\-]/g) ?? []).length;
  if (symbols > lettersAndDigits) return true;
  if (/(.)\1{6,}/.test(trimmed)) return true;
  return false;
}

function calculateQuality(text: string, removedNoiseLines: string[]) {
  const compact = text.replace(/\s/g, "");
  const arabicCount = (compact.match(/[\u0600-\u06ff]/g) ?? []).length;
  const digitGroups = text.match(/\d{3,}/g)?.length ?? 0;
  const signalCount = signalTerms.filter((term) => text.includes(term)).length;
  const usefulLines = text.split(/\n+/).filter((line) => line.trim().length >= 8).length;
  const symbolCount = (compact.match(/[^\u0600-\u06ffA-Za-z0-9،؛:./()\-]/g) ?? []).length;
  const arabicRatio = arabicCount / Math.max(1, compact.length);

  const score = Math.round(
    Math.min(text.length, 1200) * 0.04
    + arabicRatio * 45
    + signalCount * 8
    + usefulLines * 5
    + Math.min(digitGroups, 8) * 3
    - symbolCount * 2
    - removedNoiseLines.length * 4
  );

  return Math.max(0, Math.min(100, score));
}

function qualityLevel(score: number): TextQualityLevel {
  if (score < 25) return "unreadable";
  if (score < 45) return "needs-review";
  if (score < 72) return "usable";
  return "strong";
}

export function processGovernmentDocumentText(inputText: string): TextProcessingResult {
  const corrections: TextProcessingCorrection[] = [];
  const input = inputText ?? "";
  let processed = input
    .replace(/\u0640/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[|]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/([اأإآء-ي])-\n([اأإآء-ي])/g, "$1$2")
    .replace(/[ \t]+/g, " ");

  const digitNormalized = normalizeDigits(processed);
  if (digitNormalized !== processed) corrections.push({ from: "أرقام عربية/فارسية", to: "أرقام موحدة", reason: "توحيد الأرقام لتحسين استخراج الحقول" });
  processed = digitNormalized;

  processed = processed
    .replace(/ى/g, "ي")
    .replace(/ك/g, "ك")
    .replace(/\s+([،؛:])/g, "$1")
    .replace(/([،؛:])(?=\S)/g, "$1 ");

  processed = applyFixes(processed, joinedTermFixes, corrections);
  processed = applyFixes(processed, ocrWordFixes, corrections);

  const removedNoiseLines: string[] = [];
  const cleanedLines = processed.split(/\n+/).filter((line) => {
    if (isNoiseLine(line)) {
      removedNoiseLines.push(line.trim());
      return false;
    }
    return true;
  });

  processed = cleanedLines.join("\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const recognizedSignals = signalTerms.filter((term) => processed.includes(term));
  const qualityScore = calculateQuality(processed, removedNoiseLines);
  const level = qualityLevel(qualityScore);

  const warnings: string[] = [];
  const blockers: string[] = [];
  if (removedNoiseLines.length) warnings.push("تم حذف أسطر غير مفهومة أو ضجيج OCR قبل التحليل.");
  if (level === "needs-review") warnings.push("جودة النص متوسطة؛ راجع النص يدويًا قبل الاعتماد.");
  if (recognizedSignals.length === 0) warnings.push("لم يتم العثور على مصطلحات حكومية واضحة في النص.");
  if (level === "unreadable") blockers.push("النص غير معروف أو غير مقروء بما يكفي للتحليل. جرّب صورة أوضح أو أدخل النص يدويًا.");

  return {
    inputText: input,
    processedText: processed,
    corrections,
    removedNoiseLines,
    recognizedSignals,
    warnings,
    blockers,
    qualityScore,
    qualityLevel: level,
  };
}
