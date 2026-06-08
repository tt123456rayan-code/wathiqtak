import { getDocumentTemplate, type DocumentTemplateId } from "./documentTemplateRegistry";
import { maskSensitiveValue, validateAmount, validateArabicName, validateDate, validateJordanianNationalId, validateJordanianPhone, validateReferenceNumber, validateVehicleNumber } from "./formFieldValidators";

export interface ExtractedDocumentField {
  key: string;
  label: string;
  value: string;
  maskedValue?: string;
  confidence: number;
  sensitive: boolean;
  warning?: string;
}

function first(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[،,؛;|]+$/g, "").trim();
  }
  return "";
}

function addField(fields: ExtractedDocumentField[], key: string, label: string, value: string, sensitive = false, type: Parameters<typeof maskSensitiveValue>[1] = "text", confidence = 75, warning?: string) {
  if (!value) return;
  fields.push({ key, label, value, maskedValue: sensitive ? maskSensitiveValue(value, type) : undefined, sensitive, confidence, warning });
}

export function extractFieldsByTemplate(text: string, templateId: DocumentTemplateId): ExtractedDocumentField[] {
  const template = getDocumentTemplate(templateId);
  const fields: ExtractedDocumentField[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();

  const agency = first(normalized, [/(وزارة\s+[\u0600-\u06ff\s]{3,30})/, /(دائرة\s+[\u0600-\u06ff\s]{3,35})/, /(إدارة\s+[\u0600-\u06ff\s]{3,45})/, /(أمانة\s+[\u0600-\u06ff\s]{3,25})/, /(بلدية\s+[\u0600-\u06ff\s]{3,25})/, /(جامعة\s+[\u0600-\u06ff\s]{3,30})/, /(مستشفى\s+[\u0600-\u06ff\s]{3,30})/]);
  const reference = first(normalized, [/(?:رقم الكتاب|رقم المعاملة|رقم الطلب|رقم الإشارة)\s*[:\-]?\s*([A-Za-z0-9\u0660-\u0669/-]{3,})/]);
  const date = first(normalized, [/(?:التاريخ|تاريخ)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/, /(\d{4}-\d{1,2}-\d{1,2})/]);
  const name = first(normalized, [/(?:الاسم|اسم الطالب|اسم المشتري|اسم الدافع|مقدم الطلب)\s*[:\-]?\s*([\u0600-\u06ff\s]{4,45})(?=\s+(?:الرقم|تاريخ|الجنسية|المحافظة|رقم الهاتف|المبلغ|الجهة)|$)/]);
  const nationalId = first(normalized, [/(?:الرقم الوطني|رقم وطني)\s*[:\-]?\s*(\d{8,12})/]);
  const documentNumber = first(normalized, [/(?:رقم الوثيقة|رقم الجواز|رقم الرخصة|رقم القيد)\s*[:\-]?\s*(\d{4,14})/]);
  const phone = first(normalized, [/(?:رقم الهاتف|هاتف)\s*[:\-]?\s*(0?7\d{8})/, /\b(0?7\d{8})\b/]);
  const documentType = first(normalized, [/(?:نوع الوثيقة)\s*[:\-]?\s*([\u0600-\u06ff\s]{4,25})(?=\s+(?:رقم الوثيقة|التاريخ|اسم)|$)/]);
  const governorate = first(normalized, [/(?:المحافظة)\s*[:\-]?\s*([\u0600-\u06ff\s]{3,20})/, /(العاصمة|إربد|الزرقاء|البلقاء|الكرك|معان|العقبة|المفرق|جرش|عجلون|مادبا|الطفيلة)/]);
  const address = first(normalized, [/(?:العنوان)\s*[:\-]?\s*([\u0600-\u06ff0-9\s-]{5,60})(?=\s+(?:رقم الهاتف|التاريخ|المبلغ)|$)/]);
  const amount = first(normalized, [/(?:المبلغ|قيمة الرسوم|غرامة)\s*[:\-]?\s*(\d+(?:[.,]\d{1,3})?)\s*(?:دينار)?/]);
  const receiptNumber = first(normalized, [/(?:رقم الوصل|رقم الإيصال)\s*[:\-]?\s*([A-Za-z0-9/-]{3,})/]);
  const paymentDate = first(normalized, [/(?:تاريخ الدفع|دفع بتاريخ)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/]);
  const birthDate = first(normalized, [/(?:تاريخ الميلاد|تاريخ الولادة)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/]);
  const motherName = first(normalized, [/(?:اسم الأم)\s*[:\-]?\s*([\u0600-\u06ff\s]{3,30})(?=\s+(?:الجنسية|العنوان|رقم)|$)/]);
  const vehicleNumber = first(normalized, [/(?:رقم المركبة|رقم اللوحة)\s*[:\-]?\s*([\u0600-\u06ffA-Za-z0-9\s-]{3,15})/]);
  const vehicleType = first(normalized, [/(?:نوع المركبة)\s*[:\-]?\s*([\u0600-\u06ffA-Za-z0-9\s-]{3,25})(?=\s+(?:رقم|المالك|التاريخ)|$)/]);
  const licenseNumber = first(normalized, [/(?:رقم الرخصة)\s*[:\-]?\s*(\d{4,14})/]);
  const deadline = first(normalized, [/(?:آخر موعد|موعد أقصاه|قبل تاريخ)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/, /(?:خلال)\s+(\d{1,2}\s+أيام?)/]);
  const rejectionReason = first(normalized, [/(?:سبب الرفض|لسبب)\s*[:\-]?\s*([\u0600-\u06ff\s]{5,80})(?=\s+(?:يرجى|خلال|مع)|$)/]);
  const missingDocs = first(normalized, [/(?:النواقص المطلوبة|نقص الوثائق|استكمال)\s*[:\-]?\s*([\u0600-\u06ff\s،,]{5,100})(?=\s+(?:خلال|آخر موعد|مع)|$)/]);

  addField(fields, "agency", "الجهة", agency);
  addField(fields, "referenceNumber", "رقم الكتاب/المعاملة", reference, template.sensitiveFields.includes("رقم المعاملة"), "document", validateReferenceNumber(reference) ? 86 : 62);
  addField(fields, "date", "التاريخ", date, false, "text", validateDate(date) ? 86 : 60, date && !validateDate(date) ? "صيغة التاريخ تحتاج مراجعة." : undefined);
  addField(fields, "name", "الاسم", name, false, "text", validateArabicName(name) ? 84 : 58);
  addField(fields, "nationalId", "الرقم الوطني", nationalId, true, "nationalId", validateJordanianNationalId(nationalId) ? 88 : 62, nationalId && !validateJordanianNationalId(nationalId) ? "الرقم الوطني غير مؤكد." : undefined);
  addField(fields, "documentNumber", "رقم الوثيقة", documentNumber, true, templateId === "passport" ? "passport" : "document");
  addField(fields, "phone", "رقم الهاتف", phone, true, "phone", validateJordanianPhone(phone) ? 86 : 62);
  addField(fields, "documentType", "نوع الوثيقة", documentType);
  addField(fields, "governorate", "المحافظة", governorate);
  addField(fields, "address", "العنوان", address);
  addField(fields, "amount", "المبلغ", amount, false, "text", validateAmount(amount) ? 88 : 60);
  addField(fields, "receiptNumber", "رقم الوصل", receiptNumber, true, "document");
  addField(fields, "paymentDate", "تاريخ الدفع", paymentDate);
  addField(fields, "birthDate", "تاريخ الميلاد", birthDate, false, "text", validateDate(birthDate) ? 88 : 60);
  addField(fields, "motherName", "اسم الأم", motherName);
  addField(fields, "vehicleNumber", "رقم المركبة", vehicleNumber, false, "text", validateVehicleNumber(vehicleNumber) ? 82 : 55);
  addField(fields, "vehicleType", "نوع المركبة", vehicleType);
  addField(fields, "licenseNumber", "رقم الرخصة", licenseNumber, true, "license");
  addField(fields, "deadline", "آخر موعد / مهلة", deadline);
  addField(fields, "rejectionReason", "سبب الرفض", rejectionReason);
  addField(fields, "missingDocuments", "النواقص المطلوبة", missingDocs);

  return fields.filter((field) => template.expectedFields.length === 0 || field.value);
}
