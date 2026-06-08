export interface OcrNormalizationResult {
  originalText: string;
  normalizedText: string;
  corrections: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
  confidenceHints: string[];
  detectedGovernmentTerms: string[];
}

interface CorrectionRule {
  pattern: RegExp;
  to: string;
  reason: string;
}

const correctionRules: CorrectionRule[] = [
  { pattern: /\bمديريه\b/g, to: "مديرية", reason: "تصحيح تاء مربوطة في مصطلح إداري" },
  { pattern: /\bالصحه\b/g, to: "الصحة", reason: "تصحيح كتابة اسم جهة صحية" },
  { pattern: /\bالوزاره\b/g, to: "الوزارة", reason: "تصحيح تاء مربوطة في مصطلح حكومي" },
  { pattern: /\bمحافظه\b/g, to: "محافظة", reason: "تصحيح تاء مربوطة في مصطلح إداري" },
  { pattern: /\bتزويدى\b/g, to: "تزويدي", reason: "تصحيح ياء الكلمة" },
  { pattern: /تزو\s+يدي/g, to: "تزويدي", reason: "إصلاح تباعد OCR داخل الكلمة" },
  { pattern: /\bارجو\b/g, to: "أرجو", reason: "توحيد الهمزة في صيغة رسمية" },
  { pattern: /\bراس عملهم\b/g, to: "رأس عملهم", reason: "توحيد الهمزة في عبارة وظيفية" },
  { pattern: /على\s+راس\s+عملهم/g, to: "على رأس عملهم", reason: "تصحيح عبارة وظيفية شائعة" },
  { pattern: /\bلم يكونو\b/g, to: "لم يكونوا", reason: "تصحيح صيغة الجمع" },
  { pattern: /\bنسخه\b/g, to: "نسخة", reason: "تصحيح تاء مربوطة" },
  { pattern: /\bورقيه\b/g, to: "ورقية", reason: "تصحيح تاء مربوطة" },
  { pattern: /\bالكترونيه\b/g, to: "إلكترونية", reason: "توحيد الهمزة وتصحيح تاء مربوطة" },
  { pattern: /\bالكترونية\b/g, to: "إلكترونية", reason: "توحيد الهمزة" },
  { pattern: /بالسرعه\s+الممكنه/g, to: "بالسرعة الممكنة", reason: "تصحيح عبارة استعجال رسمية" },
  { pattern: /هام\s+و\s+عاجل/g, to: "هام وعاجل", reason: "توحيد عبارة الاستعجال" },
  { pattern: /\bاكسل\s+شيت\b/gi, to: "Excel Sheet", reason: "توحيد اسم صيغة الملف" },
  { pattern: /\bاكسل\b/gi, to: "Excel", reason: "توحيد اسم صيغة الملف" },
  { pattern: /\bExcelSheet\b/g, to: "Excel Sheet", reason: "إصلاح تلاصق كلمات OCR" },
  { pattern: /رقم\s+المعامله/g, to: "رقم المعاملة", reason: "تصحيح تاء مربوطة في عبارة مرجعية" },
  { pattern: /رقم\s+الكتاب/g, to: "رقم الكتاب", reason: "توحيد عبارة مرجعية حكومية" },
  { pattern: /\bمرفقات\b/g, to: "مرفقات", reason: "تأكيد مصطلح مرفقات حكومي" },
  { pattern: /\bاستكمال\b/g, to: "استكمال", reason: "تأكيد مصطلح إجراء حكومي" },
  { pattern: /\bاعتراض\b/g, to: "اعتراض", reason: "تأكيد مصطلح إجراء حكومي" },
  { pattern: /تصحيح\s+بيانات/g, to: "تصحيح بيانات", reason: "توحيد عبارة تصحيح البيانات" },
];

const governmentTerms = [
  "وزارة الصحة",
  "ديوان المحاسبة",
  "مجلس الوزراء",
  "مديرية",
  "محافظة",
  "مستشفى",
  "موظفين",
  "كشوفات",
  "بلاغات العطلة",
  "الجائحة",
  "هام وعاجل",
  "بالسرعة الممكنة",
];

const spacedWordRules: CorrectionRule[] = [
  { pattern: /م\s*د\s*ي\s*ر\s*ي\s*ة/g, to: "مديرية", reason: "إصلاح تباعد الحروف داخل كلمة حكومية" },
  { pattern: /ا\s*ل\s*ص\s*ح\s*ة/g, to: "الصحة", reason: "إصلاح تباعد الحروف داخل كلمة حكومية" },
  { pattern: /ت\s*ز\s*و\s*ي\s*د\s*ي/g, to: "تزويدي", reason: "إصلاح تباعد الحروف داخل كلمة إجراء" },
  { pattern: /ك\s*ش\s*و\s*ف\s*ا\s*ت/g, to: "كشوفات", reason: "إصلاح تباعد الحروف داخل كلمة مستندات" },
  { pattern: /م\s*و\s*ظ\s*ف\s*ي\s*ن/g, to: "موظفين", reason: "إصلاح تباعد الحروف داخل كلمة وظيفية" },
];

function applyRule(text: string, rule: CorrectionRule, corrections: OcrNormalizationResult["corrections"]) {
  return text.replace(rule.pattern, (match) => {
    if (match !== rule.to) {
      corrections.push({ from: match, to: rule.to, reason: rule.reason });
    }
    return rule.to;
  });
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([،؛:])/g, "$1")
    .replace(/([،؛:])(?=\S)/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeGovernmentOcrText(text: string): OcrNormalizationResult {
  const corrections: OcrNormalizationResult["corrections"] = [];
  const originalText = text;
  let normalizedText = normalizeWhitespace(text);

  const whitespaceNormalized = normalizedText;
  normalizedText = normalizedText.replace(/ـ/g, "");
  if (normalizedText !== whitespaceNormalized) {
    corrections.push({ from: "ـ", to: "", reason: "إزالة التطويل الناتج عن OCR" });
  }

  const hamzaSource = normalizedText;
  normalizedText = normalizedText
    .replace(/\bإلى\b/g, "إلى")
    .replace(/\bالى\b/g, "إلى")
    .replace(/\bايميل\b/g, "إيميل");
  if (normalizedText !== hamzaSource) {
    corrections.push({ from: "همزات متفرقة", to: "صياغة موحدة", reason: "توحيد همزات بسيطة دون تغيير المعنى" });
  }

  for (const rule of spacedWordRules) {
    normalizedText = applyRule(normalizedText, rule, corrections);
  }
  for (const rule of correctionRules) {
    normalizedText = applyRule(normalizedText, rule, corrections);
  }

  normalizedText = normalizeWhitespace(normalizedText);

  const detectedGovernmentTerms = governmentTerms.filter((term) => normalizedText.includes(term));
  const confidenceHints: string[] = [];
  if (corrections.length > 0) confidenceHints.push("تم تطبيق تصحيحات OCR شائعة؛ راجع النص قبل التحليل.");
  if (detectedGovernmentTerms.length > 0) confidenceHints.push("تم رصد مصطلحات حكومية تساعد التحليل المحلي.");
  if (normalizedText.length < 80) confidenceHints.push("النص قصير؛ قد تكون دقة التحليل أقل إذا كانت الصورة ناقصة.");
  if (/[?؟]{2,}|�/.test(normalizedText)) confidenceHints.push("توجد رموز غير واضحة قد تحتاج تعديلًا يدويًا.");

  return {
    originalText,
    normalizedText,
    corrections,
    confidenceHints,
    detectedGovernmentTerms,
  };
}
