export function validateJordanianNationalId(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10;
}

export function validateJordanianPhone(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return (digits.startsWith("07") && digits.length === 10) || (digits.startsWith("7") && digits.length === 9);
}

export function validateBirthDate(value?: string) {
  return validateDate(value);
}

export function validateDate(value?: string) {
  const clean = (value ?? "").trim();
  return /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/.test(clean) || /^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/.test(clean);
}

export function validateDocumentNumber(value?: string) {
  return /^\d+$/.test((value ?? "").trim());
}

export function validateArabicName(value?: string) {
  return /^[\u0600-\u06ff\s]{4,}$/.test((value ?? "").trim());
}

export function validateReferenceNumber(value?: string) {
  return /^[A-Za-z0-9\u0660-\u0669/-]{3,}$/.test((value ?? "").trim());
}

export function validateAmount(value?: string) {
  return /^\d+(?:[.,]\d{1,3})?$/.test((value ?? "").replace(/\s/g, ""));
}

export function validateVehicleNumber(value?: string) {
  return /^[\u0600-\u06ffA-Za-z0-9\s-]{3,}$/.test((value ?? "").trim());
}

export function maskSensitiveValue(value: string | undefined, type: "nationalId" | "phone" | "document" | "passport" | "license" | "civilRecord" | "longNumber" | "text") {
  if (!value) return "";
  const clean = value.trim();
  const digits = clean.replace(/\D/g, "");
  if (type === "nationalId" && digits.length >= 8) return `${digits.slice(0, 5)}*****`;
  if (type === "phone" && digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
  if (["document", "passport", "license", "civilRecord"].includes(type) && digits.length >= 6) return `${digits.slice(0, 4)}****`;
  if (type === "longNumber" && digits.length >= 8) return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
  if (digits.length >= 9) return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
  return clean;
}
