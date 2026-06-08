import type { DocumentType, LetterAnalysis } from "./analysisEngine";

export type ReplyTone = "مختصر" | "رسمي" | "عاجل";
export type ReplyType =
  | "طلب إعادة نظر"
  | "طلب استكمال نواقص"
  | "طلب تصحيح بيانات"
  | "طلب توضيح"
  | "طلب تمديد مهلة"
  | "طلب اعتراض أولي"
  | "طلب تزويد بيانات / كشوفات"
  | "استفسار رسمي عام";

export interface ReplyOptions {
  tone: ReplyTone;
  applicantName?: string;
  nationalIdOptionalMasked?: string;
  phone?: string;
  referenceNumber?: string;
  targetAgency?: string;
  attachments?: string;
  extraNotes?: string;
}

export interface ComposedOfficialReply {
  replyType: ReplyType;
  subject: string;
  body: string;
  attachmentsList: string[];
  missingFields: string[];
  warnings: string[];
  suggestedNextAction: string;
}

function replyTypeFor(documentType: DocumentType, analysis: LetterAnalysis): ReplyType {
  if (documentType === "رفض") return analysis.deadlineType !== "لا يوجد" ? "طلب إعادة نظر" : "طلب إعادة نظر";
  if (documentType === "نواقص") return "طلب استكمال نواقص";
  if (documentType === "تصحيح بيانات") return "طلب تصحيح بيانات";
  if (documentType === "غرامة") return "طلب اعتراض أولي";
  if (documentType === "موعد مراجعة") return "طلب توضيح";
  if (documentType === "طلب تزويد بيانات / كشوفات") return "طلب تزويد بيانات / كشوفات";
  return "استفسار رسمي عام";
}

function splitAttachments(value: string | undefined, fallback: string[]) {
  const parsed = (value ?? "")
    .split(/\n|،|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

export function composeOfficialReply(analysis: LetterAnalysis, options: ReplyOptions): ComposedOfficialReply {
  const replyType = replyTypeFor(analysis.documentType, analysis);
  const agency = options.targetAgency?.trim() || analysis.agency || "[الجهة المختصة]";
  const reference = options.referenceNumber?.trim() || (analysis.referenceNumber !== "غير مذكور" ? analysis.referenceNumber : "[رقم المعاملة إن وجد]");
  const applicant = options.applicantName?.trim() || "[اسم مقدم الطلب]";
  const phone = options.phone?.trim();
  const nationalId = options.nationalIdOptionalMasked?.trim();
  const attachmentsList = splitAttachments(options.attachments, analysis.requiredDocuments);
  const missingFields: string[] = [];
  const warnings = [analysis.warning];

  if (!options.applicantName?.trim()) missingFields.push("اسم مقدم الطلب");
  if (!options.referenceNumber?.trim() && analysis.referenceNumber === "غير مذكور") missingFields.push("رقم المعاملة إن وجد");
  if (!options.targetAgency?.trim() && analysis.agency === "جهة حكومية غير محددة") missingFields.push("الجهة المستلمة");
  if (analysis.riskLevel === "عالي" || analysis.deadlineType !== "لا يوجد" || options.tone === "عاجل") {
    warnings.push("نظرًا لوجود مهلة/استعجال، أرجو التكرم بالنظر في طلبي بالسرعة الممكنة.");
  }

  const subject = `${replyType} - ${reference}`;
  const identityLines = [
    `مقدم الطلب: ${applicant}`,
    nationalId ? `الرقم الوطني/المرجع الشخصي: ${nationalId}` : "",
    phone ? `رقم الهاتف: ${phone}` : "",
    `رقم المعاملة/الكتاب: ${reference}`,
  ].filter(Boolean);

  const urgentLine = warnings.length > 1 ? "\nونظرًا لوجود مهلة/استعجال، أرجو التكرم بالنظر في طلبي بالسرعة الممكنة.\n" : "";
  const notes = options.extraNotes?.trim() ? `\nملاحظات إضافية:\n${options.extraNotes.trim()}\n` : "";

  const requestByType: Record<ReplyType, string> = {
    "طلب إعادة نظر": "ألتمس منكم إعادة النظر في القرار أو تزويدي بأسباب الرفض بشكل واضح، وتمكيني من تقديم الوثائق أو الإيضاحات اللازمة حسب الأصول.",
    "طلب استكمال نواقص": "ألتمس قبول استكمال النواقص والمرفقات المطلوبة وربطها بالمعاملة أعلاه، وإعلامي بأي نواقص إضافية إن وجدت.",
    "طلب تصحيح بيانات": "ألتمس تصحيح البيانات المرتبطة بالمعاملة وفق الوثائق الرسمية المرفقة، وتحديث السجلات حسب الأصول.",
    "طلب توضيح": "ألتمس تزويدي بتوضيح رسمي حول الإجراء المطلوب وموعد المراجعة أو طريقة المتابعة.",
    "طلب تمديد مهلة": "ألتمس تمديد المهلة إن أمكن، أو توضيح آخر موعد معتمد لاستكمال الإجراء دون الإضرار بحقي في المتابعة.",
    "طلب اعتراض أولي": "ألتمس قبول هذا الاعتراض الأولي وتزويدي بسبب المخالفة أو الغرامة وآلية الاعتراض أو التصويب والمهلة المحددة لذلك.",
    "طلب تزويد بيانات / كشوفات": "تم إعداد الكشوفات المطلوبة، وتصنيف الموظفين حسب كانوا على رأس عملهم أو لم يكونوا، وتجهيز نسخة ورقية/إلكترونية، وتصديق الكشف من المسؤول المختص، تمهيدًا لتزويدكم بها بالسرعة الممكنة.",
    "استفسار رسمي عام": "ألتمس توضيح الإجراء المطلوب مني حتى أتمكن من المتابعة حسب الأصول.",
  };

  const toneIntro = options.tone === "مختصر" ? "أرجو التكرم بالاطلاع على طلبي المختصر أدناه." : "أرجو التكرم بالاطلاع على طلبي المتعلق بالكتاب أو المعاملة المشار إليها أعلاه.";
  const body = `عطوفة / سعادة / حضرة المسؤول المختص في ${agency}

الموضوع: ${subject}

تحية طيبة وبعد،

${identityLines.join("\n")}

${toneIntro}

${analysis.reason}
${urgentLine}
${requestByType[replyType]}
${notes}
المرفقات:
${attachmentsList.map((item) => `- ${item}`).join("\n")}

وتفضلوا بقبول فائق الاحترام.`;

  return {
    replyType,
    subject,
    body,
    attachmentsList,
    missingFields,
    warnings,
    suggestedNextAction: replyType === "طلب تزويد بيانات / كشوفات" ? "راجع الكشوفات وتأكد من التصديق قبل إرسال النسخة الورقية والإلكترونية." : analysis.nextBestStep,
  };
}
