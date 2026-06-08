import { extractFieldsByTemplate } from "./documentFieldExtractor";
import type { DocumentTemplateId } from "./documentTemplateRegistry";

function valueOf(fields: ReturnType<typeof extractFieldsByTemplate>, key: string) {
  return fields.find((field) => field.key === key)?.maskedValue ?? fields.find((field) => field.key === key)?.value ?? "";
}

export function parseOfficialLetter(text: string) {
  const fields = extractFieldsByTemplate(text, "official-letter");
  return {
    agency: valueOf(fields, "agency"),
    letterNumber: valueOf(fields, "referenceNumber"),
    date: valueOf(fields, "date"),
    subject: valueOf(fields, "rejectionReason") || valueOf(fields, "missingDocuments"),
    requiredAction: valueOf(fields, "missingDocuments"),
    deadline: valueOf(fields, "deadline"),
    urgency: /هام|عاجل|بالسرعة الممكنة|آخر موعد/.test(text) ? "مرتفع" : "عادي",
  };
}

export function parsePaymentReceipt(text: string) {
  const fields = extractFieldsByTemplate(text, "payment-receipt");
  return {
    agency: valueOf(fields, "agency"),
    receiptNumber: valueOf(fields, "receiptNumber"),
    amount: valueOf(fields, "amount"),
    date: valueOf(fields, "paymentDate") || valueOf(fields, "date"),
    feeType: valueOf(fields, "rejectionReason"),
    payerName: valueOf(fields, "name"),
  };
}

export function parseGovernmentApplication(text: string) {
  const fields = extractFieldsByTemplate(text, "government-application");
  return {
    applicationType: "طلب حكومي / خدمة",
    agency: valueOf(fields, "agency"),
    applicant: valueOf(fields, "name"),
    referenceNumber: valueOf(fields, "referenceNumber"),
    missingDocuments: valueOf(fields, "missingDocuments"),
    nextStep: valueOf(fields, "missingDocuments") ? "استكمال النواقص المطلوبة." : "متابعة حالة الطلب مع الجهة.",
  };
}

export function parseCertificate(text: string, templateId: DocumentTemplateId = "university-certificate") {
  const fields = extractFieldsByTemplate(text, templateId);
  return {
    certificateType: templateId,
    name: valueOf(fields, "name"),
    issuer: valueOf(fields, "agency"),
    date: valueOf(fields, "date"),
    referenceNumber: valueOf(fields, "referenceNumber"),
  };
}

export function parseIdentityLikeDocument(text: string, templateId: DocumentTemplateId = "national-id") {
  const fields = extractFieldsByTemplate(text, templateId);
  return {
    documentType: templateId,
    name: valueOf(fields, "name"),
    nationalOrDocumentNumber: valueOf(fields, "nationalId") || valueOf(fields, "documentNumber"),
    birthDate: valueOf(fields, "birthDate"),
    nationality: valueOf(fields, "governorate"),
  };
}

export function parseVehicleDocument(text: string, templateId: DocumentTemplateId = "vehicle-license") {
  const fields = extractFieldsByTemplate(text, templateId);
  return {
    documentType: templateId,
    vehicleOrLicenseNumber: valueOf(fields, "vehicleNumber") || valueOf(fields, "licenseNumber"),
    ownerOrBuyerOrSeller: valueOf(fields, "name"),
    documentNumber: valueOf(fields, "documentNumber"),
    issueOrExpiryDate: valueOf(fields, "date"),
  };
}
