export type DocumentTemplateId =
  | "national-id"
  | "passport"
  | "driver-license"
  | "vehicle-license"
  | "vehicle-transfer"
  | "birth-certificate"
  | "family-book"
  | "school-certificate"
  | "university-certificate"
  | "official-letter"
  | "payment-receipt"
  | "government-application"
  | "appointment-notice"
  | "rejection-letter"
  | "missing-documents-notice"
  | "fine-or-violation"
  | "tax-or-fee-notice"
  | "municipality-notice"
  | "court-or-legal-notice"
  | "employment-or-service-letter"
  | "medical-report"
  | "unknown";

export interface DocumentTemplate {
  id: DocumentTemplateId;
  arabicName: string;
  category:
    | "هوية وإثبات شخصية"
    | "مركبات وترخيص"
    | "شهادات وسجلات"
    | "كتب ومراسلات رسمية"
    | "وصولات ومدفوعات"
    | "طلبات ونماذج حكومية"
    | "إشعارات وقرارات"
    | "صحة وتقارير"
    | "غير معروف";
  keywords: string[];
  strongKeywords: string[];
  expectedFields: string[];
  sensitiveFields: string[];
  recommendedAction: string;
}

export const documentTemplates: DocumentTemplate[] = [
  { id: "national-id", arabicName: "الهوية الشخصية / بطاقة الأحوال", category: "هوية وإثبات شخصية", keywords: ["هوية", "أحوال", "الرقم الوطني", "الجنسية", "تاريخ الميلاد"], strongKeywords: ["بطاقة شخصية", "بطاقة الأحوال", "هوية أحوال"], expectedFields: ["الاسم", "الرقم الوطني", "تاريخ الميلاد", "الجنسية"], sensitiveFields: ["الرقم الوطني", "رقم الوثيقة"], recommendedAction: "احفظ ملخص الوثيقة واستخدمها كمرفق عند الحاجة." },
  { id: "passport", arabicName: "جواز السفر", category: "هوية وإثبات شخصية", keywords: ["جواز", "passport", "الجنسية", "تاريخ الانتهاء"], strongKeywords: ["جواز سفر", "رقم الجواز"], expectedFields: ["الاسم", "رقم الجواز", "الجنسية", "تاريخ الانتهاء"], sensitiveFields: ["رقم الجواز", "الرقم الوطني"], recommendedAction: "راجع رقم الجواز وتاريخ الانتهاء قبل استخدامه كمرفق." },
  { id: "driver-license", arabicName: "رخصة القيادة", category: "مركبات وترخيص", keywords: ["رخصة", "قيادة", "السواقين", "فئة الرخصة"], strongKeywords: ["رخصة قيادة", "إدارة ترخيص السواقين"], expectedFields: ["الاسم", "رقم الرخصة", "تاريخ الانتهاء"], sensitiveFields: ["رقم الرخصة", "الرقم الوطني"], recommendedAction: "راجع بيانات الرخصة وتاريخ الانتهاء." },
  { id: "vehicle-license", arabicName: "رخصة مركبة", category: "مركبات وترخيص", keywords: ["رخصة مركبة", "رقم المركبة", "نوع المركبة", "المالك"], strongKeywords: ["ترخيص مركبة", "رخصة اقتناء مركبة"], expectedFields: ["رقم المركبة", "نوع المركبة", "المالك", "تاريخ الانتهاء"], sensitiveFields: ["رقم الرخصة", "رقم الوثيقة"], recommendedAction: "راجع رقم المركبة والمالك وتاريخ الترخيص." },
  { id: "vehicle-transfer", arabicName: "نموذج نقل مركبة", category: "مركبات وترخيص", keywords: ["صفة التسجيل", "اسم المشتري", "اسم البائع", "رقم سند", "نوع الوثيقة"], strongKeywords: ["نموذج نقل مركبة", "إدارة ترخيص السواقين والمركبات"], expectedFields: ["اسم المشتري", "اسم البائع", "الرقم الوطني", "رقم سند"], sensitiveFields: ["الرقم الوطني", "رقم الهاتف", "رقم الوثيقة"], recommendedAction: "راجع بيانات المشتري والبائع ورقم الوثيقة قبل اعتماد النموذج." },
  { id: "birth-certificate", arabicName: "شهادة ميلاد", category: "شهادات وسجلات", keywords: ["مولود", "تاريخ الولادة", "اسم الأم", "اسم الأب"], strongKeywords: ["شهادة ميلاد"], expectedFields: ["الاسم", "تاريخ الميلاد", "اسم الأم", "الجهة"], sensitiveFields: ["الرقم الوطني", "رقم الوثيقة"], recommendedAction: "استخدمها كمرفق إثباتي بعد مراجعة البيانات." },
  { id: "family-book", arabicName: "دفتر العائلة / قيد عائلي", category: "شهادات وسجلات", keywords: ["دفتر العائلة", "قيد عائلي", "أفراد الأسرة"], strongKeywords: ["دفتر عائلة", "القيد العائلي"], expectedFields: ["الاسم", "رقم القيد", "العائلة"], sensitiveFields: ["رقم القيد", "الرقم الوطني"], recommendedAction: "راجع أفراد الأسرة ورقم القيد قبل الاستخدام." },
  { id: "school-certificate", arabicName: "شهادة مدرسية", category: "شهادات وسجلات", keywords: ["مدرسة", "الصف", "العام الدراسي", "النتيجة"], strongKeywords: ["شهادة مدرسية", "كشف علامات"], expectedFields: ["الاسم", "المدرسة", "التاريخ", "الرقم المرجعي"], sensitiveFields: ["الرقم الوطني"], recommendedAction: "احفظها كمرفق تعليمي إذا كانت البيانات واضحة." },
  { id: "university-certificate", arabicName: "شهادة جامعية / مصدقة تخرج", category: "شهادات وسجلات", keywords: ["جامعة", "كلية", "تخصص", "معدل", "تخرج"], strongKeywords: ["مصدقة تخرج", "شهادة جامعية"], expectedFields: ["الاسم", "الجامعة", "التاريخ", "الرقم المرجعي"], sensitiveFields: ["الرقم الجامعي", "الرقم الوطني"], recommendedAction: "راجع الاسم والتخصص والجهة المصدرة قبل الإرفاق." },
  { id: "official-letter", arabicName: "كتاب رسمي صادر عن وزارة أو دائرة", category: "كتب ومراسلات رسمية", keywords: ["كتاب", "وزارة", "دائرة", "الموضوع", "رقم الكتاب"], strongKeywords: ["رقم الكتاب", "عطفاً على", "نرجو", "يرجى"], expectedFields: ["الجهة", "رقم الكتاب", "التاريخ", "الموضوع"], sensitiveFields: ["رقم المعاملة"], recommendedAction: "اقرأ المطلوب والمهلة ثم جهّز الرد إذا لزم." },
  { id: "payment-receipt", arabicName: "وصل دفع / إيصال مالي", category: "وصولات ومدفوعات", keywords: ["وصل", "إيصال", "المبلغ", "دفع", "رسوم"], strongKeywords: ["وصل دفع", "رقم الوصل", "إيصال مالي"], expectedFields: ["الجهة", "رقم الوصل", "المبلغ", "تاريخ الدفع"], sensitiveFields: ["رقم الوصل"], recommendedAction: "احفظ ملخص الوصل كمرفق إثبات دفع." },
  { id: "government-application", arabicName: "طلب حكومي / نموذج طلب خدمة", category: "طلبات ونماذج حكومية", keywords: ["طلب", "خدمة", "نموذج", "مقدم الطلب", "رقم المعاملة"], strongKeywords: ["نموذج طلب", "طلب خدمة"], expectedFields: ["نوع الطلب", "الجهة", "مقدم الطلب", "رقم المعاملة"], sensitiveFields: ["الرقم الوطني", "رقم الهاتف"], recommendedAction: "راجع حالة الطلب والنواقص المطلوبة." },
  { id: "appointment-notice", arabicName: "إشعار موعد مراجعة", category: "إشعارات وقرارات", keywords: ["موعد", "مراجعة", "الحضور", "راجع"], strongKeywords: ["موعد مراجعة", "مراجعة الدائرة"], expectedFields: ["الجهة", "التاريخ", "الموعد", "رقم المعاملة"], sensitiveFields: ["رقم المعاملة"], recommendedAction: "ثبّت الموعد وجهّز الوثائق المطلوبة." },
  { id: "rejection-letter", arabicName: "كتاب رفض طلب", category: "إشعارات وقرارات", keywords: ["رفض", "مرفوض", "عدم الموافقة", "لم يتم قبول"], strongKeywords: ["رفض الطلب", "لم يتم قبول طلبكم"], expectedFields: ["الجهة", "رقم المعاملة", "سبب الرفض", "المهلة"], sensitiveFields: ["رقم المعاملة"], recommendedAction: "راجع سبب الرفض وجهّز طلب إعادة نظر إذا كان مناسبًا." },
  { id: "missing-documents-notice", arabicName: "إشعار استكمال نواقص", category: "إشعارات وقرارات", keywords: ["نواقص", "استكمال", "مرفقات", "إرفاق", "وثائق"], strongKeywords: ["نقص الوثائق", "استكمال النواقص"], expectedFields: ["الجهة", "رقم المعاملة", "النواقص المطلوبة", "المهلة"], sensitiveFields: ["رقم المعاملة"], recommendedAction: "جهّز النواقص قبل انتهاء المهلة." },
  { id: "fine-or-violation", arabicName: "مخالفة / غرامة", category: "إشعارات وقرارات", keywords: ["مخالفة", "غرامة", "إنذار", "إجراء قانوني"], strongKeywords: ["إشعار مخالفة", "غرامة مترتبة"], expectedFields: ["الجهة", "رقم المخالفة", "المبلغ", "آخر موعد"], sensitiveFields: ["رقم المخالفة"], recommendedAction: "راجع سبب المخالفة والمهلة قبل الاعتراض أو الدفع." },
  { id: "tax-or-fee-notice", arabicName: "إشعار ضريبي أو رسوم", category: "إشعارات وقرارات", keywords: ["ضريبة", "رسوم", "مستحقات", "دائرة ضريبة"], strongKeywords: ["إشعار ضريبي", "رسوم مستحقة"], expectedFields: ["الجهة", "المبلغ", "التاريخ", "رقم المكلف"], sensitiveFields: ["رقم المكلف"], recommendedAction: "راجع المبلغ والمهلة مع الجهة المختصة." },
  { id: "municipality-notice", arabicName: "إشعار بلدية", category: "إشعارات وقرارات", keywords: ["بلدية", "أمانة", "رخص مهن", "مخالفة"], strongKeywords: ["إشعار بلدية", "أمانة عمان"], expectedFields: ["الجهة", "رقم المعاملة", "المخالفة", "المهلة"], sensitiveFields: ["رقم المعاملة"], recommendedAction: "راجع الإشعار وجهّز الوثائق أو الاعتراض إذا لزم." },
  { id: "court-or-legal-notice", arabicName: "إشعار محكمة أو تبليغ قانوني", category: "إشعارات وقرارات", keywords: ["محكمة", "تبليغ", "دعوى", "جلسة", "إنذار عدلي"], strongKeywords: ["تبليغ قانوني", "إشعار محكمة"], expectedFields: ["الجهة", "رقم الدعوى", "التاريخ", "الموعد"], sensitiveFields: ["رقم الدعوى", "الرقم الوطني"], recommendedAction: "راجع محامياً أو الجهة الرسمية عند وجود موعد أو حق اعتراض." },
  { id: "employment-or-service-letter", arabicName: "كتاب خدمة / عمل / إثبات", category: "كتب ومراسلات رسمية", keywords: ["إثبات عمل", "على رأس عمله", "خدمة", "موظف"], strongKeywords: ["كتاب إثبات عمل", "شهادة خدمة"], expectedFields: ["الجهة", "الاسم", "الوظيفة", "التاريخ"], sensitiveFields: ["الرقم الوطني"], recommendedAction: "استخدمه كمرفق إثبات بعد مراجعة الاسم والجهة." },
  { id: "medical-report", arabicName: "تقرير طبي", category: "صحة وتقارير", keywords: ["تقرير طبي", "تشخيص", "مستشفى", "طبيب", "مراجعة"], strongKeywords: ["تقرير طبي", "مستشفى"], expectedFields: ["الجهة", "الاسم", "التاريخ", "نوع التقرير"], sensitiveFields: ["الرقم الوطني", "رقم الملف الطبي"], recommendedAction: "احفظه كمرفق صحي وراجع الجهة الطبية للتفاصيل." },
  { id: "unknown", arabicName: "غير معروف", category: "غير معروف", keywords: [], strongKeywords: [], expectedFields: [], sensitiveFields: [], recommendedAction: "أدخل نصًا أوضح أو اختر مثال عرض." },
];

export function getDocumentTemplate(id: DocumentTemplateId) {
  return documentTemplates.find((template) => template.id === id) ?? documentTemplates[documentTemplates.length - 1];
}
