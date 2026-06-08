import {
  validateArabicName,
  validateBirthDate,
  validateDocumentNumber,
  validateJordanianNationalId,
  validateJordanianPhone,
} from "./formFieldValidators";
import { normalizeVehicleTransferText } from "./vehicleTransferNormalizer";

export interface VehicleTransferFormResult {
  formType: "نموذج نقل مركبة";
  agency: "إدارة ترخيص السواقين والمركبات";
  extractedFields: {
    registrationType?: string;
    buyerNationalId?: string;
    buyerName?: string;
    birthDate?: string;
    motherName?: string;
    nationality?: string;
    addressGovernorate?: string;
    phone?: string;
    buyerDocumentType?: string;
    buyerDocumentNumber?: string;
    sellerName?: string;
    sellerDocumentType?: string;
    sellerDocumentNumber?: string;
    bondNumber?: string;
  };
  missingFields: string[];
  warnings: string[];
  confidenceScore: number;
  nextBestStep: string;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[،,;؛|]+$/g, "").trim();
  }
  return undefined;
}

function cleanName(value?: string) {
  return value?.replace(/[^\u0600-\u06ff\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseVehicleTransferFormText(text: string): VehicleTransferFormResult {
  const normalized = normalizeVehicleTransferText(text);
  const fields: VehicleTransferFormResult["extractedFields"] = {
    registrationType: firstMatch(normalized, [/صفة التسجيل\s*[:\-]?\s*([^\s،,|]+)/, /(خصوصي|عمومي|تجاري)/]),
    buyerNationalId: firstMatch(normalized, [/الرقم الوطني\s*[:\-]?\s*(\d{8,12})/, /رقم القيد المدني\s*[:\-]?\s*(\d{8,12})/]),
    buyerName: cleanName(firstMatch(normalized, [/اسم المشتري\s*[:\-]?\s*([\u0600-\u06ff\s]{4,40})(?=\s+(?:تاريخ|اسم الأم|الجنسية|رقم الهاتف|نوع الوثيقة|اسم البائع)|$)/])),
    birthDate: firstMatch(normalized, [/تاريخ الولادة\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/, /تاريخ الميلاد\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/]),
    motherName: cleanName(firstMatch(normalized, [/اسم الأم\s*[:\-]?\s*([\u0600-\u06ff\s]{3,30})(?=\s+(?:الجنسية|العنوان|رقم الهاتف|نوع الوثيقة)|$)/])),
    nationality: firstMatch(normalized, [/الجنسية\s*[:\-]?\s*([\u0600-\u06ff\s]{3,20})(?=\s+(?:العنوان|المحافظة|رقم الهاتف|نوع الوثيقة)|$)/]),
    addressGovernorate: firstMatch(normalized, [/المحافظة\s*[:\-]?\s*([\u0600-\u06ff\s]{3,20})/, /(العاصمة|إربد|الزرقاء|البلقاء|الكرك|معان|العقبة|المفرق|جرش|عجلون|مادبا|الطفيلة)/]),
    phone: firstMatch(normalized, [/رقم الهاتف\s*[:\-]?\s*(0?7\d{8})/, /\b(0?7\d{8})\b/]),
    buyerDocumentType: firstMatch(normalized, [/نوع الوثيقة\s*[:\-]?\s*([\u0600-\u06ff\s]{4,25})(?=\s+(?:رقم الوثيقة|اسم البائع)|$)/, /(هوية أحوال|جواز سفر)/]),
    buyerDocumentNumber: firstMatch(normalized, [/رقم الوثيقة\s*[:\-]?\s*(\d{4,12})/]),
    sellerName: cleanName(firstMatch(normalized, [/اسم البائع\s*[:\-]?\s*([\u0600-\u06ff\s]{4,40})(?=\s+(?:نوع الوثيقة|رقم الوثيقة|رقم سند)|$)/])),
    sellerDocumentType: firstMatch(normalized, [/اسم البائع[\s\S]*?نوع الوثيقة\s*[:\-]?\s*([\u0600-\u06ff\s]{4,25})(?=\s+(?:رقم الوثيقة|رقم سند)|$)/]),
    sellerDocumentNumber: firstMatch(normalized, [/اسم البائع[\s\S]*?رقم الوثيقة\s*[:\-]?\s*(\d{4,12})/]),
    bondNumber: firstMatch(normalized, [/رقم سند\s*[:\-]?\s*(\d{3,12})/]),
  };

  const required: Array<[keyof typeof fields, string]> = [
    ["buyerNationalId", "الرقم الوطني للمشتري"],
    ["buyerName", "اسم المشتري"],
    ["buyerDocumentType", "نوع وثيقة المشتري"],
    ["buyerDocumentNumber", "رقم وثيقة المشتري"],
    ["sellerName", "اسم البائع"],
    ["bondNumber", "رقم سند"],
  ];
  const missingFields = required.filter(([key]) => !fields[key]).map(([, label]) => label);
  const warnings: string[] = [];

  if (fields.buyerNationalId && !validateJordanianNationalId(fields.buyerNationalId)) warnings.push("الرقم الوطني للمشتري غير مؤكد؛ راجع عدد الخانات.");
  if (fields.phone && !validateJordanianPhone(fields.phone)) warnings.push("رقم الهاتف لا يبدو بصيغة أردنية واضحة.");
  if (fields.birthDate && !validateBirthDate(fields.birthDate)) warnings.push("تاريخ الولادة ليس بصيغة dd/mm/yyyy واضحة.");
  if (fields.buyerDocumentNumber && !validateDocumentNumber(fields.buyerDocumentNumber)) warnings.push("رقم وثيقة المشتري يحتاج مراجعة.");
  if (fields.sellerDocumentNumber && !validateDocumentNumber(fields.sellerDocumentNumber)) warnings.push("رقم وثيقة البائع يحتاج مراجعة.");
  if (fields.buyerName && !validateArabicName(fields.buyerName)) warnings.push("اسم المشتري غير واضح بالكامل من OCR.");
  if (fields.sellerName && !validateArabicName(fields.sellerName)) warnings.push("اسم البائع غير واضح بالكامل من OCR.");

  const extractedCount = Object.values(fields).filter(Boolean).length;
  const confidenceScore = Math.max(35, Math.min(95, Math.round(extractedCount * 7 + (missingFields.length ? 20 : 35) - warnings.length * 5)));

  return {
    formType: "نموذج نقل مركبة",
    agency: "إدارة ترخيص السواقين والمركبات",
    extractedFields: fields,
    missingFields,
    warnings,
    confidenceScore,
    nextBestStep: "راجع الحقول المستخرجة، ثم تأكد من اكتمال بيانات المشتري والبائع ورقم الوثيقة قبل اعتماد النموذج.",
  };
}
