export type DocumentType = "رفض" | "نواقص" | "موعد مراجعة" | "غرامة" | "تصحيح بيانات" | "طلب تزويد بيانات / كشوفات" | "إشعار عام";
export type RiskLevel = "منخفض" | "متوسط" | "عالي";
export type DeadlineType = "لا يوجد" | "تاريخ محدد" | "مدة نسبية" | "يحتاج تأكيد";

export interface LetterAnalysis {
  agency: string;
  documentType: DocumentType;
  referenceNumber: string;
  deadline: string;
  deadlineType: DeadlineType;
  urgencyMessage: string;
  confidenceScore: number;
  riskLevel: RiskLevel;
  reason: string;
  requiredActions: string[];
  requiredDocuments: string[];
  suggestedReplyType: string;
  simplifiedExplanation: string;
  nextBestStep: string;
  summary: string;
  title: string;
  warning: string;
}

const agencies = [
  "وزارة الداخلية",
  "وزارة الصحة",
  "وزارة التربية والتعليم",
  "وزارة العمل",
  "وزارة التنمية الاجتماعية",
  "دائرة الأحوال المدنية والجوازات",
  "دائرة ضريبة الدخل والمبيعات",
  "إدارة ترخيص السواقين والمركبات",
  "أمانة عمان الكبرى",
  "البلدية",
  "الدائرة",
];

const docRules: Array<{ type: DocumentType; words: string[]; reply: string }> = [
  { type: "طلب تزويد بيانات / كشوفات", words: ["تزويدي", "تزويدنا", "يرجى تزويد", "أرجو تزويدي", "كشوفات", "كشف", "قوائم", "أسماء الموظفين", "على رأس عملهم", "لم يكونوا على رأس عملهم", "Excel", "Excel Sheet", "نسخة ورقية", "نسخة إلكترونية", "تصديق الكشوفات"], reply: "تزويد بيانات وكشوفات" },
  { type: "رفض", words: ["رفض", "مرفوض", "لم يتم قبول", "تعذر الموافقة", "عدم الموافقة", "إعادة نظر", "تظلم"], reply: "طلب إعادة نظر" },
  { type: "نواقص", words: ["نواقص", "نقص الوثائق", "استكمال", "مرفقات", "مرفق", "إرفاق", "وثيقة", "إثبات", "إحضار"], reply: "طلب قبول استكمال النواقص" },
  { type: "موعد مراجعة", words: ["مراجعة الدائرة", "مراجعة", "راجع", "موعد", "الحضور", "مراجعتكم"], reply: "طلب تثبيت/توضيح موعد مراجعة" },
  { type: "غرامة", words: ["غرامة", "مخالفة", "جزاء", "رسوم مترتبة", "إنذار", "إجراء قانوني"], reply: "طلب توضيح/اعتراض أولي" },
  { type: "تصحيح بيانات", words: ["تصحيح بيانات", "تصويب بيانات", "تعديل بيانات", "خطأ في البيانات", "تصحيح الاسم", "تصحيح رقم الهاتف", "تصويب الاسم", "تعديل الرقم الوطني"], reply: "طلب تصحيح بيانات" },
];

const docKeywords = ["هوية", "دفتر العائلة", "إثبات سكن", "عقد إيجار", "شهادة", "وصل", "صورة شخصية", "مرفقات", "وثيقة", "مرفق", "إثبات", "رخصة"];

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function extractAgency(text: string) {
  return agencies.find((agency) => agency !== "الدائرة" && text.includes(agency)) ?? (text.includes("الدائرة") ? "الدائرة المختصة" : "جهة حكومية غير محددة");
}

function extractReferenceNumber(text: string) {
  const match = text.match(/(?:رقم\s*(?:الطلب|المعاملة|الكتاب|الإشارة)|معاملة\s*رقم)\s*[:：-]?\s*([A-Za-z0-9\u0660-\u0669/-]{3,})/);
  return match?.[1] ?? "غير مذكور";
}

function extractDeadline(text: string): { deadline: string; deadlineType: DeadlineType } {
  const relative = text.match(/(?:خلال|خلال مدة لا تتجاوز|في مدة|مدة)\s+(\d{1,2}|[\u0660-\u0669]{1,2})\s+(?:يوم|أيام|يوماً|أيام عمل)/);
  if (relative) return { deadline: `خلال ${relative[1]} أيام`, deadlineType: "مدة نسبية" };
  const dated = text.match(/(?:قبل تاريخ|آخر موعد|موعد أقصاه|تقديم الاعتراض خلال|راجع خلال)\s*[:：-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  const date = dated?.[1];
  if (date) return { deadline: date, deadlineType: "تاريخ محدد" };
  if (/(آخر موعد|المهلة|من تاريخه|أيام عمل|موعد أقصاه|مدة لا تتجاوز|راجع خلال|تقديم الاعتراض خلال)/.test(text)) return { deadline: "توجد مهلة تحتاج تأكيدًا من النص الأصلي", deadlineType: "يحتاج تأكيد" };
  return { deadline: "لا توجد مهلة واضحة", deadlineType: "لا يوجد" };
}

function detectType(text: string) {
  return docRules.find((rule) => hasAny(text, rule.words));
}

function calculateRisk(text: string, deadlineType: DeadlineType, type: DocumentType): RiskLevel {
  if (type === "طلب تزويد بيانات / كشوفات" && hasAny(text, ["هام وعاجل", "بالسرعة الممكنة"])) return "عالي";
  if (hasAny(text, ["إنذار", "إجراء قانوني", "إلغاء", "حجز"]) || type === "غرامة") return "عالي";
  if ((type === "رفض" || type === "نواقص") && deadlineType !== "لا يوجد") return "عالي";
  if (deadlineType !== "لا يوجد" || type === "رفض" || type === "نواقص" || type === "موعد مراجعة") return "متوسط";
  return "منخفض";
}

function confidence(text: string, agency: string, type: DocumentType, deadlineType: DeadlineType, referenceNumber: string) {
  let score = 35;
  if (agency !== "جهة حكومية غير محددة") score += 15;
  if (type !== "إشعار عام") score += 20;
  if (deadlineType !== "لا يوجد") score += 12;
  if (referenceNumber !== "غير مذكور") score += 8;
  if (hasAny(text, docKeywords)) score += 10;
  return Math.min(score, 96);
}

function urgencyMessage(deadlineType: DeadlineType, risk: RiskLevel) {
  if (deadlineType === "لا يوجد") return "لا تظهر مهلة واضحة، لكن احتفظ بالكتاب وتأكد من الجهة عند الشك.";
  if (risk === "عالي") return "يوجد عنصر زمني مهم. تعامل معه اليوم ولا تنتظر نهاية المهلة.";
  if (deadlineType === "يحتاج تأكيد") return "توجد إشارة إلى مهلة، لكن التاريخ يحتاج مراجعة النص الأصلي أو الجهة.";
  return "سجل الموعد وتابع قبل انتهاء المهلة بوقت كاف.";
}

function resolveUrgency(text: string, deadlineType: DeadlineType, risk: RiskLevel, type: DocumentType) {
  if (type === "طلب تزويد بيانات / كشوفات" && hasAny(text, ["هام وعاجل", "بالسرعة الممكنة"])) {
    return "الكتاب عاجل ويطلب تنفيذًا سريعًا دون تحديد موعد نهائي واضح.";
  }
  return urgencyMessage(deadlineType, risk);
}

function reason(type: DocumentType) {
  const map: Record<DocumentType, string> = {
    رفض: "الخطاب يتضمن رفضًا أو عدم موافقة ويحتاج ردًا مرتبًا أو طلب إعادة نظر.",
    نواقص: "الجهة تطلب استكمال وثائق أو مرفقات قبل السير بالمعاملة.",
    "موعد مراجعة": "الخطاب يطلب مراجعة الجهة أو الحضور في موعد محدد أو محتمل.",
    غرامة: "الخطاب يتضمن غرامة أو مخالفة أو إنذارًا يحتاج توضيحًا سريعًا.",
    "تصحيح بيانات": "المطلوب تصحيح أو تصويب بيانات في المعاملة.",
    "طلب تزويد بيانات / كشوفات": "الكتاب يطلب تجهيز بيانات أو كشوفات وإرسالها للجهة المختصة.",
    "إشعار عام": "الخطاب يبدو إشعارًا عامًا، ويحتاج فقط فهم الإجراء التالي.",
  };
  return map[type];
}

function nextStep(type: DocumentType, deadlineType: DeadlineType) {
  if (deadlineType !== "لا يوجد") return "سجل المهلة الآن، ثم جهز الوثائق والرد قبل انتهاء الموعد.";
  if (type === "رفض") return "جهز طلب إعادة نظر مختصرًا مع سبب واضح ومرفقات داعمة.";
  if (type === "نواقص") return "اجمع الوثائق الناقصة وتواصل مع الجهة لتأكيد طريقة التسليم.";
  if (type === "غرامة") return "تحقق من سبب الغرامة واسأل عن حق الاعتراض أو التصويب.";
  if (type === "تصحيح بيانات") return "جهز وثيقة تثبت البيانات الصحيحة وقدم طلب التصحيح.";
  if (type === "طلب تزويد بيانات / كشوفات") return "جهز الكشوفات المطلوبة، صنفها بوضوح، صدقها من المسؤول، ثم أرسل النسخة الورقية والإلكترونية بسرعة.";
  return "اتصل بالجهة أو راجعها إذا لم يكن الإجراء المطلوب واضحًا.";
}

function actions(type: DocumentType, deadlineType: DeadlineType) {
  const base = ["تأكد من رقم المعاملة وتاريخ الكتاب قبل أي إجراء.", "احتفظ بنسخة من الكتاب والمرفقات."];
  if (deadlineType !== "لا يوجد") base.unshift("سجل المهلة في ملف المتابعة ولا تؤجلها.");
  if (type === "رفض") return [...base, "اكتب سبب اعتراضك أو طلب إعادة النظر بجملة واضحة.", "أرفق ما يثبت صحة طلبك."];
  if (type === "نواقص") return [...base, "حدد الوثائق الناقصة من النص.", "راجع الجهة لتسليم النواقص بالطريقة المعتمدة."];
  if (type === "غرامة") return [...base, "اطلب توضيح سبب الغرامة وقيمة المبلغ.", "اسأل عن حق الاعتراض أو مهلة السداد."];
  if (type === "تصحيح بيانات") return [...base, "جهز وثيقة تثبت البيانات الصحيحة.", "اطلب تصويب البيانات وربطها برقم المعاملة."];
  if (type === "طلب تزويد بيانات / كشوفات") return [...base, "إعداد كشوفات بالأسماء المطلوبة.", "تصنيف الموظفين حسب كانوا على رأس عملهم أو لم يكونوا.", "تجهيز نسخة ورقية وإلكترونية بصيغة Excel عند الحاجة.", "تصديق الكشوفات من المسؤول.", "إرسالها للجهة المطلوبة بالسرعة الممكنة."];
  if (type === "موعد مراجعة") return [...base, "جهز الهوية والوثائق الأساسية قبل المراجعة.", "اطلب تثبيت الموعد إذا كان غير واضح."];
  return [...base, "راجع الجهة الرسمية إذا بقي الإجراء غير واضح."];
}

export function analyzeGovernmentLetter(text: string): LetterAnalysis {
  const normalized = text.trim().replace(/\s+/g, " ");
  const rule = detectType(normalized);
  const documentType = rule?.type ?? "إشعار عام";
  const agency = extractAgency(normalized);
  const referenceNumber = extractReferenceNumber(normalized);
  const { deadline, deadlineType } = extractDeadline(normalized);
  const adjustedDeadlineType = documentType === "طلب تزويد بيانات / كشوفات" && hasAny(normalized, ["هام وعاجل", "بالسرعة الممكنة"]) && deadlineType === "لا يوجد" ? "يحتاج تأكيد" : deadlineType;
  const adjustedDeadline = adjustedDeadlineType === "يحتاج تأكيد" && deadlineType === "لا يوجد" ? "عاجل دون موعد نهائي واضح" : deadline;
  const riskLevel = calculateRisk(normalized, adjustedDeadlineType, documentType);
  const requiredDocuments = docKeywords.filter((word) => normalized.includes(word));
  const simplifiedExplanation = `المعنى المبسط: الجهة تريد منك التعامل مع موضوع "${documentType}". ركز على المهلة، رقم المعاملة، والوثائق المطلوبة قبل إرسال أي رد.`;
  return {
    agency,
    documentType,
    referenceNumber,
    deadline: adjustedDeadline,
    deadlineType: adjustedDeadlineType,
    urgencyMessage: resolveUrgency(normalized, adjustedDeadlineType, riskLevel, documentType),
    confidenceScore: confidence(normalized, agency, documentType, adjustedDeadlineType, referenceNumber),
    riskLevel,
    reason: reason(documentType),
    requiredActions: actions(documentType, adjustedDeadlineType),
    requiredDocuments: requiredDocuments.length ? requiredDocuments : ["الهوية الشخصية", "صورة عن الكتاب", "أي وثيقة تدعم الطلب"],
    suggestedReplyType: rule?.reply ?? "استفسار رسمي",
    simplifiedExplanation,
    nextBestStep: nextStep(documentType, deadlineType),
    summary: `${agency} · ${documentType} · ${adjustedDeadline}`,
    title: `${documentType} - ${agency}`,
    warning: "هذا التحليل مساعد أولي ولا يعد استشارة قانونية ولا يغني عن مراجعة الجهة الرسمية عند وجود مهلة أو حق اعتراض.",
  };
}

export function generateOfficialReply(analysis: LetterAnalysis): string {
  const attachments = analysis.requiredDocuments.map((doc) => `- ${doc}`).join("\n");
  const refLine = analysis.referenceNumber !== "غير مذكور" ? `رقم المعاملة/الكتاب: ${analysis.referenceNumber}\n` : "";
  const requestByType: Record<DocumentType, string> = {
    رفض: "ألتمس منكم إعادة النظر في القرار أو تزويدي بسبب الرفض بشكل واضح، وتمكيني من تقديم ما يلزم من وثائق داعمة.",
    نواقص: "ألتمس قبول استكمال النواقص والمرفقات المطلوبة وربطها بالمعاملة حسب الأصول.",
    "موعد مراجعة": "ألتمس تثبيت أو توضيح موعد المراجعة والإجراءات والوثائق المطلوبة عند الحضور.",
    غرامة: "ألتمس توضيح سبب الغرامة أو المخالفة، وبيان إمكانية الاعتراض أو التصويب والمهلة المحددة لذلك.",
    "تصحيح بيانات": "ألتمس تصحيح البيانات الواردة في المعاملة وفق الوثائق الرسمية المرفقة.",
    "طلب تزويد بيانات / كشوفات": "سنعمل على إعداد الكشوفات المطلوبة، وتصنيف الموظفين حسب كانوا على رأس عملهم أو لم يكونوا، وتجهيز نسخة ورقية وإلكترونية، وتصديق الكشوفات من المسؤول المختص، ثم تزويدكم بها بالسرعة الممكنة.",
    "إشعار عام": "ألتمس توضيح الإجراء المطلوب مني بخصوص هذا الإشعار حتى أتمكن من المتابعة حسب الأصول.",
  };
  return `عطوفة / سعادة / حضرة المسؤول المختص في ${analysis.agency}

الموضوع: ${analysis.suggestedReplyType}
${refLine}
تحية طيبة وبعد،

أرجو التكرم بالاطلاع على طلبي المتعلق بالكتاب المشار إليه أعلاه، حيث إن مضمونه يتعلق بـ ${analysis.documentType}.

${analysis.reason}

${requestByType[analysis.documentType]}

المرفقات المحتملة:
${attachments}

راجياً إعلامي بأي نواقص إضافية أو مهلة واجبة، وتفضلوا بقبول فائق الاحترام.`;
}
