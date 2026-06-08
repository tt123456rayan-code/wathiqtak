import { documentTemplates, getDocumentTemplate, type DocumentTemplateId } from "./documentTemplateRegistry";
import { processGovernmentDocumentText } from "./textProcessingPipeline";

export interface DocumentTemplateDetection {
  templateId: DocumentTemplateId;
  templateName: string;
  category: string;
  confidence: number;
  matchedKeywords: string[];
  alternatives: Array<{
    templateId: DocumentTemplateId;
    templateName: string;
    confidence: number;
  }>;
}

function hasPatternBoost(text: string, templateId: DocumentTemplateId) {
  let boost = 0;
  if (/(?:الرقم الوطني|رقم وطني)\s*[:\-]?\s*\d{8,12}/.test(text) && ["national-id", "vehicle-transfer", "government-application"].includes(templateId)) boost += 12;
  if (/(?:رقم الكتاب|رقم المعاملة|رقم الطلب)\s*[:\-]?\s*[\w\u0660-\u0669/-]{3,}/.test(text) && ["official-letter", "government-application", "rejection-letter", "missing-documents-notice"].includes(templateId)) boost += 12;
  if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/.test(text)) boost += 5;
  if (/(?:المبلغ|دينار|رسوم)\s*[:\-]?\s*\d+/.test(text) && ["payment-receipt", "fine-or-violation", "tax-or-fee-notice"].includes(templateId)) boost += 14;
  if (/(?:وزارة|دائرة|بلدية|أمانة|محكمة|مستشفى|جامعة|مدرسة)/.test(text)) boost += 4;
  return boost;
}

export function detectDocumentTemplate(text: string): DocumentTemplateDetection {
  const processed = processGovernmentDocumentText(text);
  const normalized = processed.processedText.replace(/\s+/g, " ").trim();
  if (processed.qualityLevel === "unreadable") {
    const unknown = getDocumentTemplate("unknown");
    return {
      templateId: "unknown",
      templateName: unknown.arabicName,
      category: unknown.category,
      confidence: 0,
      matchedKeywords: [],
      alternatives: [],
    };
  }
  const scored = documentTemplates
    .filter((template) => template.id !== "unknown")
    .map((template) => {
      const matchedStrong = template.strongKeywords.filter((word) => normalized.includes(word));
      const matchedNormal = template.keywords.filter((word) => normalized.includes(word));
      const matchedKeywords = [...new Set([...matchedStrong, ...matchedNormal])];
      const score = matchedStrong.length * 28 + matchedNormal.length * 10 + hasPatternBoost(normalized, template.id);
      const confidence = Math.min(100, Math.round(score));
      return { template, matchedKeywords, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const top = scored[0];
  const hasOfficialSignals = processed.recognizedSignals.length >= 2 && /(رقم الكتاب|رقم المعاملة|وزارة|دائرة|إدارة|نموذج|وصل|شهادة|غرامة|مخالفة|استكمال|رفض)/.test(normalized);
  const selected = top && (top.confidence >= 45 || (hasOfficialSignals && top.confidence >= 34)) && top.matchedKeywords.length >= 2 ? top.template : getDocumentTemplate("unknown");

  return {
    templateId: selected.id,
    templateName: selected.arabicName,
    category: selected.category,
    confidence: selected.id === "unknown" ? 0 : top.confidence,
    matchedKeywords: selected.id === "unknown" ? [] : top.matchedKeywords,
    alternatives: scored.slice(0, 3).map((item) => ({
      templateId: item.template.id,
      templateName: item.template.arabicName,
      confidence: item.confidence,
    })),
  };
}
