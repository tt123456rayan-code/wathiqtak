export interface GovernmentFormDetection {
  formType: "vehicle-transfer" | "unknown";
  confidence: number;
  matchedTerms: string[];
}

const vehicleTransferTerms = [
  "إدارة ترخيص السواقين والمركبات",
  "ادارة ترخيص السواقين والمركبات",
  "نموذج نقل مركبة",
  "صفة التسجيل",
  "اسم المشتري",
  "اسم المشترى",
  "اسم البائع",
  "الرقم الوطني",
  "نوع الوثيقة",
  "رقم الوثيقة",
  "رقم سند",
];

export function detectGovernmentFormType(text: string): GovernmentFormDetection {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matchedTerms = vehicleTransferTerms.filter((term) => normalized.includes(term));
  const confidence = Math.min(100, Math.round((matchedTerms.length / 6) * 100));

  return {
    formType: matchedTerms.length >= 4 || (normalized.includes("نموذج نقل مركبة") && matchedTerms.length >= 2) ? "vehicle-transfer" : "unknown",
    confidence,
    matchedTerms,
  };
}
