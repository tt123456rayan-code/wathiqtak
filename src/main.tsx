import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CalendarClock, CheckCircle2, Clipboard, Download, FileText, LockKeyhole, MessageSquareText, Printer, Trash2, Upload } from "lucide-react";
import { localRulesProvider } from "./lib/aiProvider";
import { extractTextFromImage, extractTextMultiPass, type MultiPassOcrResult } from "./lib/ocrEngine";
import { analyzeDocumentImageQuality, prepareImageForWeakDevice, type ImageQualityReport } from "./lib/imageQuality";
import { buildImageProcessingPlan, detectDeviceTier, selectMobileOcrMode, type MobileOcrMode } from "./lib/mobileOcrStrategy";
import type { LetterAnalysis, RiskLevel } from "./lib/analysisEngine";
import { composeOfficialReply, type ComposedOfficialReply, type ReplyTone } from "./lib/replyComposer";
import { normalizeGovernmentOcrText, type OcrNormalizationResult } from "./lib/ocrTextNormalizer";
import { detectGovernmentFormType } from "./lib/formDocumentDetector";
import { maskSensitiveValue } from "./lib/formFieldValidators";
import { parseVehicleTransferFormText, type VehicleTransferFormResult } from "./lib/vehicleTransferFormParser";
import { normalizeVehicleTransferText } from "./lib/vehicleTransferNormalizer";
import { detectDocumentTemplate, type DocumentTemplateDetection } from "./lib/documentTemplateDetector";
import { extractFieldsByTemplate, type ExtractedDocumentField } from "./lib/documentFieldExtractor";
import { documentTemplates, getDocumentTemplate } from "./lib/documentTemplateRegistry";
import "./styles.css";

type CaseStatus = "جديد" | "قيد المتابعة" | "تم الإجراء";
type InputMode = "text" | "image";

interface CaseFile {
  id: string;
  analysis: LetterAnalysis;
  status: CaseStatus;
  createdAt: string;
  officialReply?: ComposedOfficialReply;
}

interface DocumentInsight {
  detection: DocumentTemplateDetection;
  fields: ExtractedDocumentField[];
  recommendedAction: string;
}

const demoScenarios = [
  {
    label: "رفض مع مهلة 10 أيام",
    text: "وزارة الداخلية، رقم المعاملة 2026/1458، نعلمكم بأنه لم يتم قبول طلبكم لوجود نقص الوثائق وعدم إرفاق إثبات سكن، ويرجى استكمال المرفقات خلال مدة لا تتجاوز 10 أيام عمل من تاريخه.",
  },
  {
    label: "إنذار وغرامة بتاريخ محدد",
    text: "أمانة عمان الكبرى، رقم الكتاب AMM-7781، نعلمكم بوجود مخالفة وغرامة مترتبة، ويعتبر آخر موعد للاعتراض قبل تاريخ 20/06/2026، وبخلاف ذلك سيتم اتخاذ إجراء قانوني حسب الأصول.",
  },
  {
    label: "تصحيح بيانات مع رقم معاملة",
    text: "دائرة الأحوال المدنية والجوازات، رقم الطلب 99127، يرجى تصويب بيانات الاسم ورقم الهاتف وإرفاق وثيقة تثبت البيانات الصحيحة لمتابعة المعاملة.",
  },
  {
    label: "كتاب وزارة الصحة - طلب كشوفات عاجل",
    text: "وزارة الصحه، هام و عاجل، ارجو تزو يدي بقوائم أسماء الموظفين على راس عملهم والموظفين ممن لم يكونو على راس عملهم، على أن تكون الكشوفات اكسل شيت ونسخه ورقيه والكترونيه مع تصديق الكشوفات من المسؤول، وذلك بالسرعه الممكنه.",
    normalize: true,
  },
  {
    label: "نموذج نقل مركبة - الترخيص",
    text: "المملكة الأردنية الهاشمية إدارة ترخيص السواقين والمركبات نموذج نقل مركبة صفة التسجيل خصوصي الرقم الوطني 1234567890 اسم المشترى أحمد محمد سالم تاريخ الولادة 12/05/1990 اسم الأم ليلى الجنسية الأردنية المحافظة العاصمه رقم الباتف 0791234567 نوع الوثيقة هوية احوال رقم الوثيقة 7654321 اسم البائع خالد محمود علي نوع الوثيقة هوية. Wal رقم الوثيقة 2345678 رقم سند 998877",
    normalize: true,
  },
  { label: "هوية شخصية وهمية", text: "بطاقة الأحوال المدنية هوية أحوال الاسم سارة أحمد محمود الرقم الوطني 9872034493 تاريخ الميلاد 02/03/1996 الجنسية الأردنية رقم الوثيقة 13235729", normalize: true },
  { label: "شهادة جامعية وهمية", text: "جامعة اليرموك مصدقة تخرج الاسم ليث محمد علي كلية تقنية المعلومات تخصص نظم معلومات التاريخ 15/07/2025 الرقم المرجعي UNI-44521", normalize: true },
  { label: "كتاب رسمي وهمي", text: "وزارة العمل رقم الكتاب ML-2026-441 التاريخ 04/06/2026 الموضوع تزويد وثائق يرجى مراجعة الدائرة خلال 7 أيام وإحضار المرفقات المطلوبة", normalize: true },
  { label: "وصل دفع وهمي", text: "إيصال مالي رقم الوصل REC-88421 أمانة عمان الكبرى اسم الدافع مريم خالد المبلغ 25 دينار تاريخ الدفع 01/06/2026 نوع الرسوم رسوم خدمة", normalize: true },
  { label: "طلب حكومي وهمي", text: "نموذج طلب خدمة دائرة الأحوال المدنية مقدم الطلب عمر محمود رقم المعاملة APP-55210 النواقص المطلوبة صورة الهوية وإثبات سكن الخطوة التالية استكمال النواقص", normalize: true },
  { label: "إشعار نواقص وهمي", text: "إشعار استكمال نواقص رقم المعاملة 2026/778 دائرة حكومية يرجى استكمال النواقص المطلوبة مرفق إثبات السكن وصورة الهوية خلال 10 أيام", normalize: true },
  { label: "مخالفة أو غرامة وهمية", text: "إشعار مخالفة بلدية رقم المخالفة V-10028 المبلغ 35 دينار آخر موعد 20/06/2026 سبب المخالفة عدم تجديد رخصة مهن", normalize: true },
];

const brandIconUrl = `${import.meta.env.BASE_URL}brand/wathiqtak-icon.svg`;
const brandLogoUrl = `${import.meta.env.BASE_URL}brand/wathiqtak-logo.svg`;

function loadCases(): CaseFile[] {
  try {
    return JSON.parse(localStorage.getItem("wathiqtak_cases") ?? "[]");
  } catch {
    return [];
  }
}

function persistCases(cases: CaseFile[]) {
  localStorage.setItem("wathiqtak_cases", JSON.stringify(cases));
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`risk risk-${risk}`}>{risk}</span>;
}

function App() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [autoAnalyzeAfterOcr, setAutoAnalyzeAfterOcr] = useState(true);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrError, setOcrError] = useState("");
  const [canStopOcr, setCanStopOcr] = useState(false);
  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrNormalization, setOcrNormalization] = useState<OcrNormalizationResult | null>(null);
  const [reviewedNormalizedText, setReviewedNormalizedText] = useState("");
  const [showOcrCorrections, setShowOcrCorrections] = useState(false);
  const [multiPassResult, setMultiPassResult] = useState<MultiPassOcrResult | null>(null);
  const [showMultiPassRaw, setShowMultiPassRaw] = useState(false);
  const [qualityReport, setQualityReport] = useState<ImageQualityReport | null>(null);
  const [isQualityChecking, setIsQualityChecking] = useState(false);
  const [allowPoorImageOcr, setAllowPoorImageOcr] = useState(false);
  const [selectedMobileOcrMode, setSelectedMobileOcrMode] = useState<MobileOcrMode>(() => selectMobileOcrMode());
  const [analysis, setAnalysis] = useState<LetterAnalysis | null>(null);
  const [documentInsight, setDocumentInsight] = useState<DocumentInsight | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleTransferFormResult | null>(null);
  const [reply, setReply] = useState<ComposedOfficialReply | null>(null);
  const [replyTone, setReplyTone] = useState<ReplyTone>("رسمي");
  const [replyApplicantName, setReplyApplicantName] = useState("");
  const [replyNationalIdMasked, setReplyNationalIdMasked] = useState("");
  const [replyReferenceNumber, setReplyReferenceNumber] = useState("");
  const [replyTargetAgency, setReplyTargetAgency] = useState("");
  const [replyPhone, setReplyPhone] = useState("");
  const [replyAttachments, setReplyAttachments] = useState("");
  const [replyExtraNotes, setReplyExtraNotes] = useState("");
  const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false);
  const [cases, setCases] = useState<CaseFile[]>(loadCases);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);

  const reminders = useMemo(() => cases.filter((item) => item.analysis.deadlineType !== "لا يوجد" && item.status !== "تم الإجراء"), [cases]);
  const deviceTier = useMemo(() => detectDeviceTier(), []);
  const recommendedMode = useMemo(() => selectMobileOcrMode(deviceTier), [deviceTier]);
  const selectedPlan = useMemo(() => buildImageProcessingPlan(selectedMobileOcrMode), [selectedMobileOcrMode]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  async function analyze(customText = text) {
    if (!customText.trim()) {
      setNotice("أدخل نص الكتاب أولًا أو جرّب أحد سيناريوهات العرض.");
      return;
    }
    setVehicleForm(null);
    setDocumentInsight(null);
    const result = await localRulesProvider.analyzeGovernmentLetter(customText);
    setAnalysis(result);
    setReply(null);
    setReplyReferenceNumber(result.referenceNumber !== "غير مذكور" ? result.referenceNumber : "");
    setReplyTargetAgency(result.agency !== "جهة حكومية غير محددة" ? result.agency : "");
    setReplyAttachments(result.requiredDocuments.join("\n"));
    setIsReplyComposerOpen(false);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function applyOcrNormalization(rawText: string, keepMultiPassResult = false) {
    const normalized = normalizeGovernmentOcrText(rawText);
    const formReadyText = normalizeVehicleTransferText(normalized.normalizedText);
    setOcrRawText(rawText);
    setOcrNormalization(normalized);
    setReviewedNormalizedText(formReadyText);
    setShowOcrCorrections(false);
    if (!keepMultiPassResult) {
      setMultiPassResult(null);
      setShowMultiPassRaw(false);
    }
    setText(formReadyText);
    if (normalized.blockingIssues.length) {
      setDocumentInsight(null);
      setVehicleForm(null);
      setAnalysis(null);
      setOcrError(normalized.blockingIssues[0]);
      return { ...normalized, normalizedText: formReadyText };
    }
    detectAndSetDocumentInsight(formReadyText);
    return { ...normalized, normalizedText: formReadyText };
  }

  function detectAndSetDocumentInsight(candidateText: string) {
    const detection = detectDocumentTemplate(candidateText);
    if (detection.templateId !== "unknown") {
      const template = getDocumentTemplate(detection.templateId);
      let fields = extractFieldsByTemplate(candidateText, detection.templateId);
      if (detection.templateId === "vehicle-transfer") {
        const parsed = parseVehicleTransferFormText(candidateText);
        setVehicleForm(parsed);
        fields = vehicleFormToDocumentFields(parsed);
      } else {
        setVehicleForm(null);
      }
      setDocumentInsight({ detection, fields, recommendedAction: template.recommendedAction });
      setAnalysis(null);
      setReply(null);
      setIsReplyComposerOpen(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return true;
    }
    setDocumentInsight(null);
    setVehicleForm(null);
    return false;
  }

  function detectAndSetVehicleForm(candidateText: string) {
    const detection = detectGovernmentFormType(candidateText);
    if (detection.formType === "vehicle-transfer") {
      setVehicleForm(parseVehicleTransferFormText(candidateText));
      setAnalysis(null);
      setReply(null);
      setIsReplyComposerOpen(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return true;
    }
    setVehicleForm(null);
    return false;
  }

  async function analyzeReviewedOcrText() {
    const reviewed = reviewedNormalizedText.trim() ? reviewedNormalizedText : text;
    setText(reviewed);
    if (detectAndSetDocumentInsight(reviewed)) return;
    await analyze(reviewed);
  }

  async function analyzeEntryText() {
    if (detectAndSetDocumentInsight(text)) return;
    await analyze();
  }

  async function runDemo(sample: string, normalizeSample = false) {
    setInputMode("text");
    if (normalizeSample) {
      const normalized = applyOcrNormalization(sample);
      if (detectDocumentTemplate(normalized.normalizedText).templateId !== "unknown") return;
      await analyze(normalized.normalizedText);
      return;
    }
    setOcrRawText("");
    setOcrNormalization(null);
    setReviewedNormalizedText("");
    setShowOcrCorrections(false);
    setMultiPassResult(null);
    setShowMultiPassRaw(false);
    setVehicleForm(null);
    setDocumentInsight(null);
    setText(sample);
    await analyze(sample);
  }

  async function checkImageQuality(file = selectedImage) {
    if (!file) return;
    setIsQualityChecking(true);
    try {
      setQualityReport(await analyzeDocumentImageQuality(file));
      setNotice("تم فحص الصورة.");
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "تعذر فحص جودة الصورة.");
    } finally {
      setIsQualityChecking(false);
    }
  }

  async function handleImage(file?: File) {
    if (!file) return;
    setInputMode("image");
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setQualityReport(null);
    setAllowPoorImageOcr(false);
    setOcrError("");
    setOcrProgress(0);
    setOcrStatus("");
    setCanStopOcr(false);
    setOcrRawText("");
    setOcrNormalization(null);
    setReviewedNormalizedText("");
    setShowOcrCorrections(false);
    setMultiPassResult(null);
    setShowMultiPassRaw(false);
    setVehicleForm(null);
    setDocumentInsight(null);
    await checkImageQuality(file);
  }

  async function runOcr() {
    if (!selectedImage || isOcrRunning) return;
    if (qualityReport?.level === "poor" && !allowPoorImageOcr) {
      setOcrError("قد تكون نتيجة القراءة غير دقيقة. صوّر الورقة بإضاءة أفضل أو من مسافة أقرب، أو اضغط تابع رغم ضعف الصورة.");
      return;
    }
    setIsOcrRunning(true);
    setOcrError("");
    setOcrProgress(0);
    setOcrStatus("جاري قراءة الصورة...");
    try {
      let ocrFile: File | Blob = selectedImage;
      if (deviceTier === "weak") {
        ocrFile = await prepareImageForWeakDevice(selectedImage, 1000);
      } else if (deviceTier === "medium") {
        ocrFile = await prepareImageForWeakDevice(selectedImage, 1400);
      }
      const extracted = await extractTextFromImage(ocrFile instanceof File ? ocrFile : new File([ocrFile], selectedImage.name, { type: ocrFile.type || "image/jpeg" }), (progress, status) => {
        setOcrProgress(progress);
        setOcrStatus(status || "جاري قراءة الصورة...");
      });
      const normalized = applyOcrNormalization(extracted);
      setNotice("تم استخراج النص وتحسينه محليًا.");
      if (autoAnalyzeAfterOcr && !normalized.blockingIssues.length && detectDocumentTemplate(normalized.normalizedText).templateId === "unknown") await analyze(normalized.normalizedText);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "تعذر استخراج النص من الصورة.");
    } finally {
      setIsOcrRunning(false);
    }
  }

  async function runMultiPassOcr() {
    if (!selectedImage || isOcrRunning) return;
    if (qualityReport?.level === "poor" && !allowPoorImageOcr) {
      setOcrError("قد تكون نتيجة القراءة غير دقيقة. صوّر الورقة بإضاءة أفضل أو من مسافة أقرب، أو اضغط تابع رغم ضعف الصورة.");
      return;
    }
    setIsOcrRunning(true);
    setOcrError("");
    setOcrProgress(0);
    setOcrStatus("تجهيز الصورة...");
    setMultiPassResult(null);
    setShowMultiPassRaw(false);
    const abortController = new AbortController();
    ocrAbortRef.current = abortController;
    setCanStopOcr(true);
    try {
      const result = await extractTextMultiPass(selectedImage, {
        deviceTier,
        signal: abortController.signal,
        onProgress: (progress, status) => {
          setOcrProgress(progress);
          setOcrStatus(status);
        },
      });
      setMultiPassResult(result);
      setOcrStatus("تحسين النص...");
      const normalized = applyOcrNormalization(result.bestText, true);
      setNotice("تمت القراءة متعددة الطبقات وتحسين النص محليًا.");
      if (autoAnalyzeAfterOcr && !normalized.blockingIssues.length && detectDocumentTemplate(normalized.normalizedText).templateId === "unknown") await analyze(normalized.normalizedText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تشغيل القراءة متعددة الطبقات.";
      setOcrError(
        message.includes("إيقاف")
          ? "تم إيقاف القراءة. يمكنك تشغيلها مرة أخرى أو إدخال النص يدويًا."
          : message.includes("لم نتمكن من استخراج نص موثوق")
            ? "لم نتمكن من استخراج نص موثوق. جرّب صورة أوضح أو أدخل النص يدويًا."
            : message
      );
    } finally {
      setIsOcrRunning(false);
      setCanStopOcr(false);
      ocrAbortRef.current = null;
    }
  }

  function stopOcr() {
    ocrAbortRef.current?.abort();
    setCanStopOcr(false);
    setOcrStatus("جاري إيقاف القراءة...");
    setNotice("تم طلب إيقاف القراءة.");
  }

  function vehicleFormSummary(form = vehicleForm) {
    if (!form) return "";
    return [
      `${form.formType} - ${form.agency}`,
      `الثقة: ${form.confidenceScore}%`,
      `اسم المشتري: ${form.extractedFields.buyerName ?? "غير واضح"}`,
      `الرقم الوطني: ${maskSensitiveValue(form.extractedFields.buyerNationalId, "nationalId") || "غير واضح"}`,
      `الهاتف: ${maskSensitiveValue(form.extractedFields.phone, "phone") || "غير واضح"}`,
      `اسم البائع: ${form.extractedFields.sellerName ?? "غير واضح"}`,
      `رقم سند: ${maskSensitiveValue(form.extractedFields.bondNumber, "document") || "غير واضح"}`,
      `الحقول الناقصة: ${form.missingFields.length ? form.missingFields.join("، ") : "لا يوجد"}`,
      `الخطوة التالية: ${form.nextBestStep}`,
    ].join("\n");
  }

  async function copyVehicleFormSummary() {
    await copyText(vehicleFormSummary(), "تم نسخ ملخص النموذج.");
  }

  function documentSummary(insight = documentInsight) {
    if (!insight) return "";
    return [
      `${insight.detection.templateName} - ${insight.detection.category}`,
      `الثقة: ${insight.detection.confidence}%`,
      `الكلمات المطابقة: ${insight.detection.matchedKeywords.join("، ") || "غير واضح"}`,
      ...insight.fields.map((field) => `${field.label}: ${field.maskedValue ?? field.value}`),
      `الخطوة التالية: ${insight.recommendedAction}`,
    ].join("\n");
  }

  async function copyDocumentSummary() {
    await copyText(documentSummary(), "تم نسخ ملخص الوثيقة.");
  }

  function saveDocumentCase() {
    if (!documentInsight) return;
    const syntheticAnalysis: LetterAnalysis = {
      title: documentInsight.detection.templateName,
      agency: documentInsight.fields.find((field) => field.key === "agency")?.value ?? "جهة غير محددة",
      documentType: "إشعار عام",
      referenceNumber: documentInsight.fields.find((field) => field.key === "referenceNumber")?.value ?? "غير مذكور",
      deadline: documentInsight.fields.find((field) => field.key === "deadline")?.value ?? "لا يوجد",
      deadlineType: documentInsight.fields.some((field) => field.key === "deadline") ? "يحتاج تأكيد" : "لا يوجد",
      urgencyMessage: "وثيقة مصنفة تلقائيًا تحتاج مراجعة المستخدم.",
      confidenceScore: documentInsight.detection.confidence,
      riskLevel: documentInsight.detection.category === "إشعارات وقرارات" ? "متوسط" : "منخفض",
      reason: "تم التعرف على نوع الوثيقة واستخراج حقولها المهمة محليًا.",
      requiredActions: [documentInsight.recommendedAction],
      requiredDocuments: [],
      suggestedReplyType: "ملخص وثيقة",
      simplifiedExplanation: documentSummary(),
      summary: documentSummary(),
      nextBestStep: documentInsight.recommendedAction,
      warning: "هذا تصنيف مساعد من OCR وقد يحتوي أخطاء؛ راجع الوثيقة الأصلية قبل الاعتماد.",
    };
    const next = [{ id: crypto.randomUUID(), analysis: syntheticAnalysis, status: "جديد" as CaseStatus, createdAt: new Date().toISOString() }, ...cases];
    setCases(next);
    persistCases(next);
    setNotice("تم حفظ ملف المتابعة.");
  }

  function canPrepareOfficialReply(templateId = documentInsight?.detection.templateId) {
    return !!templateId && ["official-letter", "rejection-letter", "missing-documents-notice", "fine-or-violation", "appointment-notice", "tax-or-fee-notice", "municipality-notice", "court-or-legal-notice"].includes(templateId);
  }

  function saveVehicleFormCase() {
    if (!vehicleForm) return;
    const syntheticAnalysis: LetterAnalysis = {
      title: vehicleForm.formType,
      agency: vehicleForm.agency,
      documentType: "إشعار عام",
      referenceNumber: vehicleForm.extractedFields.bondNumber ?? "غير مذكور",
      deadline: "لا يوجد",
      deadlineType: "لا يوجد",
      urgencyMessage: "نموذج بيانات يحتاج مراجعة الحقول قبل الاعتماد.",
      confidenceScore: vehicleForm.confidenceScore,
      riskLevel: vehicleForm.warnings.length || vehicleForm.missingFields.length ? "متوسط" : "منخفض",
      reason: "تم التعرف على نموذج حكومي جدولي وليس خطابًا عاديًا.",
      requiredActions: ["مراجعة الحقول المستخرجة", "تأكيد بيانات المشتري والبائع", "مراجعة رقم الوثيقة ورقم السند"],
      requiredDocuments: vehicleForm.missingFields,
      suggestedReplyType: "مراجعة نموذج",
      simplifiedExplanation: vehicleFormSummary(),
      summary: vehicleFormSummary(),
      nextBestStep: vehicleForm.nextBestStep,
      warning: "هذا استخراج مساعد من OCR وقد يحتوي أخطاء؛ راجع النموذج الأصلي قبل الاعتماد.",
    };
    const next = [{ id: crypto.randomUUID(), analysis: syntheticAnalysis, status: "جديد" as CaseStatus, createdAt: new Date().toISOString() }, ...cases];
    setCases(next);
    persistCases(next);
    setNotice("تم حفظ ملف المتابعة.");
  }

  async function analyzeAsPlainText() {
    setVehicleForm(null);
    await analyze(text);
  }

  function makeReply() {
    if (!analysis) return;
    setReply(composeOfficialReply(analysis, {
      tone: replyTone,
      applicantName: replyApplicantName,
      nationalIdOptionalMasked: replyNationalIdMasked,
      referenceNumber: replyReferenceNumber,
      targetAgency: replyTargetAgency,
      phone: replyPhone,
      attachments: replyAttachments,
      extraNotes: replyExtraNotes,
    }));
    setNotice("تم توليد الرد الرسمي.");
  }

  function saveCase(officialReply = reply) {
    if (!analysis) return;
    const next = [{ id: crypto.randomUUID(), analysis, officialReply: officialReply ?? undefined, status: "جديد" as CaseStatus, createdAt: new Date().toISOString() }, ...cases];
    setCases(next);
    persistCases(next);
    setNotice("تم حفظ ملف المتابعة.");
  }

  function updateStatus(id: string, status: CaseStatus) {
    const next = cases.map((item) => (item.id === id ? { ...item, status } : item));
    setCases(next);
    persistCases(next);
  }

  function deleteCase(id: string) {
    const next = cases.filter((item) => item.id !== id);
    setCases(next);
    persistCases(next);
  }

  async function copyText(value: string, message = "تم النسخ.") {
    await navigator.clipboard.writeText(value);
    setNotice(message);
  }

  function downloadReply() {
    if (!reply) return;
    const content = `${reply.subject}\n\n${reply.body}\n\nالمرفقات:\n${reply.attachmentsList.join("\n")}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wathiqtak-reply.txt";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("تم تحميل الرد.");
  }

  function resetCurrent() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setText("");
    setImagePreview("");
    setSelectedImage(null);
    setQualityReport(null);
    setAllowPoorImageOcr(false);
    setOcrRawText("");
    setOcrNormalization(null);
    setReviewedNormalizedText("");
    setShowOcrCorrections(false);
    setMultiPassResult(null);
    setShowMultiPassRaw(false);
    setCanStopOcr(false);
    setVehicleForm(null);
    setDocumentInsight(null);
    setInputMode("text");
    setAnalysis(null);
    setReply(null);
    setIsReplyComposerOpen(false);
    setNotice("تم البدء من جديد.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="brand-mark"><img src={brandIconUrl} alt="" /></div>
        <div className="hero-copy">
          <img className="brand-logo" src={brandLogoUrl} alt="وثيقتك" />
          <h1>وثيقتك</h1>
          <p>وثيقتك… من ورقة معقدة إلى إجراء واضح.</p>
          <div className="flow">
            <span>1. أدخل أو صوّر الكتاب</span>
            <span>2. افهم القرار والمهلة</span>
            <span>3. جهّز الرد الرسمي</span>
            <span>4. تابع ملفك</span>
          </div>
        </div>
      </section>

      <section className="principle">
        <LockKeyhole size={20} />
        <p>مبدأ وثيقتك: المعالجة محلية في نسخة MVP. لا نطلب كلمة مرور أو رمز تحقق، ولا نرسل كتابك لأي جهة خارجية. قراءة النص من الصورة تتم داخل المتصفح، ولا يتم رفع الصورة إلى أي خادم. راجع الجهة الرسمية عند وجود مهلة أو حق اعتراض.</p>
      </section>

      <section className="quick-actions">
        <button onClick={() => { setInputMode("image"); cameraInputRef.current?.click(); }}><Upload size={18} /> صوّر كتاب حكومي</button>
        <button onClick={() => setInputMode("text")}><FileText size={18} /> ألصق نص رسالة حكومية</button>
        <button onClick={() => runDemo(demoScenarios[0].text)}><AlertTriangle size={18} /> عندي رفض طلب</button>
        <button onClick={() => runDemo(demoScenarios[1].text)}><CalendarClock size={18} /> عندي مهلة أو موعد</button>
        <button onClick={resetCurrent}>ابدأ من جديد</button>
      </section>

      {notice && <div className="app-notice" role="status">{notice}</div>}

      <section className="panel why-panel">
        <div className="section-title"><CheckCircle2 size={22} /><h2>لماذا وثيقتك؟</h2></div>
        <div className="reason-grid">
          <article>يقلل ضياع الحقوق بسبب عدم فهم الكتب الحكومية.</article>
          <article>يساعد المواطن على التصرف قبل انتهاء المهلة.</article>
          <article>يعمل محليًا في نسخة العرض ويحافظ على الخصوصية.</article>
        </div>
      </section>

      <section className="panel how-panel">
        <div className="section-title"><Clipboard size={22} /><h2>كيف يعمل؟</h2></div>
        <div className="how-steps">
          <span>1. أدخل أو صوّر الكتاب</span>
          <span>2. افهم القرار والمهلة</span>
          <span>3. جهّز الرد الرسمي</span>
          <span>4. تابع ملفك</span>
        </div>
      </section>

      <TemplateLibrary />

      <section className="panel demo-panel">
        <div className="section-title"><CheckCircle2 size={22} /><h2>جرّب سيناريو العرض</h2></div>
        <div className="demo-grid">
          {demoScenarios.map((sample) => <button key={sample.label} className="demo-card" onClick={() => runDemo(sample.text, sample.normalize)}>{sample.label}</button>)}
        </div>
      </section>

      <section className="panel input-panel">
        <div className="section-title"><MessageSquareText size={22} /><h2>إدخال الكتاب</h2></div>
        <div className="tabs">
          <button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")}>ألصق النص</button>
          <button className={inputMode === "image" ? "active" : ""} onClick={() => { setInputMode("image"); fileInputRef.current?.click(); }}>ارفع صورة / لقطة شاشة</button>
        </div>
        <input ref={fileInputRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} />
        <input ref={cameraInputRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(event) => handleImage(event.target.files?.[0])} />
        {inputMode === "image" && (
          <div className="image-box">
            <div className="capture-tips">
              <h3>قبل التصوير</h3>
              <ul>
                <li>ضع الورقة على سطح ثابت.</li>
                <li>اجعل الإضاءة مباشرة وواضحة.</li>
                <li>تجنب الظلال.</li>
                <li>صوّر الورقة كاملة.</li>
                <li>قرّب الكاميرا من النص.</li>
                <li>اجعل الورقة مستقيمة قدر الإمكان.</li>
              </ul>
              <p>تصحيح الميلان المتقدم ضمن خطة نسخة Android.</p>
            </div>
            <div className="action-row">
              <button className="primary" onClick={() => cameraInputRef.current?.click()}><Upload size={18} /> صوّر كتابًا حكوميًا</button>
              <button className="secondary" onClick={() => fileInputRef.current?.click()}>اختر صورة من الجهاز</button>
            </div>
            <p>كل الفحص يتم على جهازك، ولا يتم رفع الصورة لأي خادم.</p>
            {imagePreview && <img src={imagePreview} alt="معاينة الكتاب المرفوع" />}
            {selectedImage && (
              <div className={`quality-card quality-${qualityReport?.level ?? "pending"}`}>
                <h3>فحص جودة الصورة</h3>
                {isQualityChecking && <p>جاري فحص الصورة...</p>}
                {qualityReport && (
                  <>
                    <div className="quality-score">
                      <strong>{qualityReport.score}/100</strong>
                      <span>{qualityReport.level === "good" ? "جيدة" : qualityReport.level === "acceptable" ? "مقبولة" : "ضعيفة"}</span>
                    </div>
                    <p className="quality-verdict">
                      {qualityReport.level === "good" && "الصورة مناسبة للقراءة."}
                      {qualityReport.level === "acceptable" && "يمكن المتابعة، لكن قد تحتاج تعديل النص."}
                      {qualityReport.level === "poor" && "يفضل إعادة التصوير."}
                    </p>
                    {qualityReport.level === "poor" && <p className="quality-warning">قد تكون نتيجة القراءة غير دقيقة. صوّر الورقة بإضاءة أفضل أو من مسافة أقرب.</p>}
                    <div className="quality-metrics">
                      <span>{qualityReport.metrics.width}×{qualityReport.metrics.height}</span>
                      <span>إضاءة {qualityReport.metrics.brightness}</span>
                      <span>تباين {qualityReport.metrics.contrast}</span>
                      <span>حدة {qualityReport.metrics.sharpness}</span>
                      <span>{qualityReport.metrics.fileSizeKb}KB</span>
                    </div>
                    {!!qualityReport.warnings.length && <Checklist title="تحذيرات الصورة" items={qualityReport.warnings} />}
                    <Checklist title="اقتراحات التحسين" items={qualityReport.suggestions} />
                  </>
                )}
                <div className="action-row">
                  <button className="secondary" onClick={() => void checkImageQuality()}>فحص الصورة مرة أخرى</button>
                  {qualityReport?.level === "poor" && <button className="secondary" onClick={() => cameraInputRef.current?.click()}>أعد التصوير</button>}
                  {qualityReport?.level === "poor" && <button className="secondary" onClick={() => { setAllowPoorImageOcr(true); setOcrError(""); }}>تابع رغم ضعف الصورة</button>}
                  {qualityReport?.level === "poor" && <button className="secondary" onClick={() => runDemo(demoScenarios[3].text, demoScenarios[3].normalize)}>جرّب مثال وزارة الصحة</button>}
                  {qualityReport && qualityReport.level !== "poor" && <button className="primary" onClick={runOcr}>ابدأ القراءة الآن</button>}
                </div>
              </div>
            )}
            <div className="ocr-flow">
              <span>1. ارفع الصورة</span>
              <span>2. استخرج النص</span>
              <span>3. راجع النص</span>
              <span>4. حلّل</span>
            </div>
            <div className="ocr-mode-grid">
              <button className="ocr-mode active" onClick={() => setSelectedMobileOcrMode(recommendedMode)}>القراءة المحلية التجريبية للويب</button>
              <div className="future-mode">Lite للأجهزة الضعيفة <span>ضمن خطة نسخة Android المحلية</span></div>
              <div className="future-mode">Balanced للأجهزة المتوسطة <span>ضمن خطة نسخة Android المحلية</span></div>
              <div className="future-mode">Pro للأجهزة القوية <span>ضمن خطة نسخة Android المحلية</span></div>
            </div>
            <div className="device-card">
              <h3>أفضل وضع لجهازك</h3>
              <p>قوة الجهاز المتوقعة: <strong>{deviceTier === "weak" ? "ضعيف" : deviceTier === "strong" ? "قوي" : "متوسط"}</strong></p>
              <p>الوضع المقترح: <strong>{recommendedMode}</strong></p>
              <p>سبب الاختيار: {buildImageProcessingPlan(recommendedMode).expectedSpeed}، و{buildImageProcessingPlan(recommendedMode).expectedAccuracy}.</p>
              <p>خطة المعالجة الحالية: عرض أقصى {selectedPlan.maxImageWidth}px، تقسيم مناطق: {selectedPlan.splitIntoRegions ? "نعم" : "لا"}، تحسين تباين: {selectedPlan.enhanceContrast ? "نعم" : "لا"}، تصحيح الميل: {selectedPlan.deskew ? "نعم" : "لا"}.</p>
              <p>تحذير: الدقة تعتمد على جودة الصورة، الإضاءة، وضوح الخط، واستقامة الكتاب.</p>
              <p>أوضاع الهاتف تعمل داخل نسخة Android المحلية، أما نسخة الويب تستخدم قراءة تجريبية فقط.</p>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={autoAnalyzeAfterOcr} onChange={(event) => setAutoAnalyzeAfterOcr(event.target.checked)} />
              تحليل تلقائي بعد الاستخراج
            </label>
            <div className="action-row">
              <button className="primary" onClick={runMultiPassOcr} disabled={!selectedImage || isOcrRunning}>
                {isOcrRunning ? "جاري تشغيل القراءة..." : "قراءة محسّنة متعددة الطبقات"}
              </button>
              <button className="secondary" onClick={runOcr} disabled={!selectedImage || isOcrRunning}>
                قراءة تجريبية بسيطة
              </button>
            </div>
            <p>قد يحتاج OCR إلى إنترنت أول مرة لتحميل ملفات اللغة، لكن الصورة والنص لا يتم رفعهما لأي خادم.</p>
            {(isOcrRunning || ocrProgress > 0) && (
              <div className="ocr-progress">
                <span>{ocrStatus || "جاري قراءة الصورة..."} · {ocrProgress}%</span>
                <div><i style={{ width: `${Math.max(3, ocrProgress)}%` }} /></div>
              </div>
            )}
            {isOcrRunning && canStopOcr && <button className="danger" onClick={stopOcr}>إيقاف القراءة</button>}
            {ocrError && <p className="ocr-error">{ocrError}</p>}
            {multiPassResult && (
              <div className="multi-pass-card">
                <div className="normalizer-head">
                  <h3>نتيجة القراءة متعددة الطبقات</h3>
                  <span>{multiPassResult.rawResults.length} طبقات</span>
                </div>
                <div className="quality-metrics">
                  <span>الطبقة المختارة: {multiPassResult.selectedVariant}</span>
                  <span>درجة القراءة: {multiPassResult.rawResults[0]?.score ?? 0}</span>
                  <span>النتائج الخام: {multiPassResult.rawResults.length}</span>
                </div>
                {!!multiPassResult.warnings.length && <Checklist title="تحذيرات القراءة" items={multiPassResult.warnings} />}
                <div className="action-row">
                  <button className="secondary" onClick={() => setShowMultiPassRaw(!showMultiPassRaw)}>
                    {showMultiPassRaw ? "إخفاء النتائج الخام" : "عرض النتائج الخام لكل طبقة"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const normalized = ocrNormalization?.normalizedText ?? reviewedNormalizedText;
                      setReviewedNormalizedText(normalized);
                      setText(normalized);
                      setNotice("تم استخدام النص المحسن.");
                    }}
                  >
                    استخدم النص المحسن
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setReviewedNormalizedText(multiPassResult.bestText);
                      setText(multiPassResult.bestText);
                      setNotice("تم استخدام النص الخام الأفضل.");
                    }}
                  >
                    استخدم النص الخام
                  </button>
                </div>
                {showMultiPassRaw && (
                  <div className="raw-result-list">
                    {multiPassResult.rawResults.map((item) => (
                      <article key={item.variant}>
                        <strong>{item.variant} · score {item.score}</strong>
                        {!!item.warnings.length && <small>{item.warnings.join("، ")}</small>}
                        <pre>{item.text || "لم يتم استخراج نص واضح."}</pre>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
            {ocrNormalization && (
              <div className="normalizer-card">
                <div className="normalizer-head">
                  <h3>تحسين النص المستخرج</h3>
                  <span>{ocrNormalization.corrections.length} تصحيح</span>
                </div>
                <p>هذه الطبقة لا تقرأ الصورة؛ هي تحسن النص الناتج من OCR محليًا قبل التحليل.</p>
                <div className={`text-quality text-quality-${ocrNormalization.qualityLevel}`}>
                  <strong>جودة النص: {ocrNormalization.qualityScore}/100</strong>
                  <span>
                    {ocrNormalization.qualityLevel === "strong" && "قوي"}
                    {ocrNormalization.qualityLevel === "usable" && "قابل للتحليل"}
                    {ocrNormalization.qualityLevel === "needs-review" && "يحتاج مراجعة"}
                    {ocrNormalization.qualityLevel === "unreadable" && "غير معروف"}
                  </span>
                </div>
                {!!ocrNormalization.blockingIssues.length && <Checklist title="تم منع التحليل التلقائي" items={ocrNormalization.blockingIssues} />}
                {!!ocrNormalization.removedNoiseLines.length && <p className="quality-warning">تم تجاهل {ocrNormalization.removedNoiseLines.length} سطر غير مفهوم من OCR.</p>}
                {!!ocrNormalization.detectedGovernmentTerms.length && (
                  <div className="term-list">
                    {ocrNormalization.detectedGovernmentTerms.map((term) => <span key={term}>{term}</span>)}
                  </div>
                )}
                {!!ocrNormalization.confidenceHints.length && <Checklist title="ملاحظات المراجعة" items={ocrNormalization.confidenceHints} />}
                {!!ocrNormalization.corrections.length && (
                  <>
                    <button className="secondary" onClick={() => setShowOcrCorrections(!showOcrCorrections)}>
                      {showOcrCorrections ? "إخفاء التصحيحات" : "عرض التصحيحات"}
                    </button>
                    {showOcrCorrections && (
                      <div className="correction-list">
                        {ocrNormalization.corrections.map((item, index) => (
                          <div key={`${item.from}-${item.to}-${index}`}>
                            <strong>{item.from}</strong>
                            <span>←</span>
                            <strong>{item.to}</strong>
                            <small>{item.reason}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <label>
                  النص المنظف القابل للتعديل
                  <textarea
                    value={reviewedNormalizedText}
                    onChange={(event) => {
                      setReviewedNormalizedText(event.target.value);
                      setText(event.target.value);
                    }}
                  />
                </label>
                <div className="action-row">
                  <button className="primary" onClick={analyzeReviewedOcrText}>حلّل النص بعد المراجعة</button>
                  {!!ocrRawText && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setReviewedNormalizedText(ocrRawText);
                        setText(ocrRawText);
                        setNotice("تم استخدام النص الأصلي.");
                      }}
                    >
                      استخدم النص الأصلي بدل المنظف
                    </button>
                  )}
                </div>
              </div>
            )}
            <p>قد تختلف دقة قراءة النص حسب وضوح الصورة. يمكنك تعديل النص المستخرج قبل إنشاء الرد الرسمي.</p>
          </div>
        )}
        <textarea
          id="letter-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (ocrNormalization) setReviewedNormalizedText(event.target.value);
          }}
          placeholder="ألصق نص الكتاب أو الرسالة الحكومية هنا..."
        />
        {inputMode === "image" && text.trim() && <div className="extracted-card">النص المستخرج جاهز للمراجعة والتعديل قبل التحليل.</div>}
        {inputMode === "image" && text.trim() && !autoAnalyzeAfterOcr && <button className="secondary" onClick={ocrNormalization ? analyzeReviewedOcrText : () => analyze()}>حلّل النص المستخرج</button>}
        <button className="primary" onClick={analyzeEntryText}>حلّل الكتاب</button>
      </section>

      {documentInsight && (
        <section className="panel document-panel" ref={resultRef}>
          <div className="section-title"><Clipboard size={22} /><h2>تم التعرف على نوع الوثيقة</h2></div>
          <div className="analysis-grid">
            <Info label="نوع الوثيقة" value={documentInsight.detection.templateName} />
            <Info label="التصنيف" value={documentInsight.detection.category} />
            <Info label="درجة الثقة" value={`${documentInsight.detection.confidence}%`} />
            <Info label="الخطوة التالية" value={documentInsight.recommendedAction} />
          </div>
          {!!documentInsight.detection.matchedKeywords.length && (
            <div className="term-list document-terms">
              {documentInsight.detection.matchedKeywords.map((term) => <span key={term}>{term}</span>)}
            </div>
          )}
          <DocumentFields fields={documentInsight.fields} />
          <Checklist title="تحذيرات الحقول" items={documentInsight.fields.filter((field) => field.warning).map((field) => `${field.label}: ${field.warning}`)} />
          <div className="warning"><AlertTriangle size={18} /> الحقول الحساسة مخفية جزئيًا. التصنيف مبني على القوالب الحكومية والرسمية الشائعة ولا يغني عن مراجعة الجهة الرسمية.</div>
          {!canPrepareOfficialReply() && <div className="next-step">هذه وثيقة تعريفية/إثباتية. يمكنك حفظ ملخصها أو استخدامها كمرفق، ولا يلزم رد رسمي إلا إذا كانت ضمن معاملة.</div>}
          <div className="action-row">
            {canPrepareOfficialReply() && <button className="primary" onClick={analyzeAsPlainText}>حلّل كخطاب حكومي</button>}
            <button className="secondary" onClick={copyDocumentSummary}>نسخ ملخص الوثيقة</button>
            <button className="secondary" onClick={saveDocumentCase}>حفظ كملف متابعة</button>
          </div>
        </section>
      )}

      {vehicleForm && !documentInsight && (
        <section className="panel form-panel" ref={resultRef}>
          <div className="section-title"><Clipboard size={22} /><h2>تم التعرف على نموذج نقل مركبة</h2></div>
          <div className="analysis-grid">
            <Info label="نوع النموذج" value={vehicleForm.formType} />
            <Info label="الجهة" value={vehicleForm.agency} />
            <Info label="درجة الثقة" value={`${vehicleForm.confidenceScore}%`} />
            <Info label="الخطوة التالية" value={vehicleForm.nextBestStep} />
          </div>
          <VehicleTransferFields form={vehicleForm} />
          {!!vehicleForm.missingFields.length && <Checklist title="الحقول الناقصة" items={vehicleForm.missingFields} />}
          {!!vehicleForm.warnings.length && <Checklist title="تحذيرات" items={vehicleForm.warnings} />}
          <div className="warning"><AlertTriangle size={18} /> لا يتم عرض الأرقام الوطنية أو أرقام الهواتف كاملة. راجع النموذج الأصلي قبل اعتماد البيانات.</div>
          <div className="action-row">
            <button className="secondary" onClick={copyVehicleFormSummary}>نسخ ملخص النموذج</button>
            <button className="secondary" onClick={saveVehicleFormCase}>حفظ كملف متابعة</button>
            <button className="primary" onClick={analyzeAsPlainText}>تحليل كنص عادي بدل نموذج</button>
          </div>
        </section>
      )}

      {analysis && !vehicleForm && (
        <section className="panel result-panel" ref={resultRef}>
          <div className="section-title"><Clipboard size={22} /><h2>نتيجة الفهم</h2></div>
          <div className="analysis-grid">
            <Info label="نوع الخطاب" value={analysis.documentType} />
            <Info label="الجهة" value={analysis.agency} />
            <Info label="رقم المعاملة/الكتاب" value={analysis.referenceNumber} />
            <div className="info-box"><span>مستوى الخطورة</span><RiskBadge risk={analysis.riskLevel} /></div>
            <Info label="المهلة" value={analysis.deadline} />
          </div>
          <div className="confidence"><span>درجة الثقة {analysis.confidenceScore}%</span><div><i style={{ width: `${analysis.confidenceScore}%` }} /></div></div>
          <div className="next-step"><strong>أفضل خطوة الآن:</strong> {analysis.nextBestStep}</div>
          <p className="summary">{analysis.simplifiedExplanation}</p>
          <p className="reason">{analysis.reason}</p>
          <Checklist title="الإجراءات المقترحة" items={analysis.requiredActions} />
          <Checklist title="الوثائق المحتملة" items={analysis.requiredDocuments} />
          <div className="warning"><AlertTriangle size={18} /> {analysis.warning}</div>
          <div className="action-row">
            <button className="primary" onClick={() => setIsReplyComposerOpen(true)}>جهّز ردي الرسمي</button>
            <button className="secondary" onClick={() => saveCase()}>حفظ ملف متابعة</button>
          </div>
        </section>
      )}

      {analysis && isReplyComposerOpen && (
        <section className="panel printable">
          <div className="section-title"><FileText size={22} /><h2>جهّز ردي الرسمي</h2></div>
          <div className="reply-form no-print">
            <label>نبرة الرد<select value={replyTone} onChange={(event) => setReplyTone(event.target.value as ReplyTone)}><option>مختصر</option><option>رسمي</option><option>عاجل</option></select></label>
            <label>الاسم<input value={replyApplicantName} onChange={(event) => setReplyApplicantName(event.target.value)} placeholder="[اسم مقدم الطلب]" /></label>
            <label>الرقم الوطني المقنع<input value={replyNationalIdMasked} onChange={(event) => setReplyNationalIdMasked(event.target.value)} placeholder="مثال: 99******12" /></label>
            <label>رقم المعاملة<input value={replyReferenceNumber} onChange={(event) => setReplyReferenceNumber(event.target.value)} placeholder="[رقم المعاملة إن وجد]" /></label>
            <label>الجهة<input value={replyTargetAgency} onChange={(event) => setReplyTargetAgency(event.target.value)} placeholder="[الجهة المختصة]" /></label>
            <label>رقم الهاتف<input value={replyPhone} onChange={(event) => setReplyPhone(event.target.value)} placeholder="اختياري" /></label>
            <label>المرفقات<textarea value={replyAttachments} onChange={(event) => setReplyAttachments(event.target.value)} /></label>
            <label>ملاحظات إضافية<textarea value={replyExtraNotes} onChange={(event) => setReplyExtraNotes(event.target.value)} placeholder="اختياري" /></label>
            <button className="primary" onClick={makeReply}>توليد الرد</button>
          </div>
          {reply && (
            <>
              <Info label="الموضوع" value={reply.subject} />
              <pre className="reply">{reply.body}</pre>
              <Checklist title="المرفقات" items={reply.attachmentsList} />
              {!!reply.missingFields.length && <Checklist title="الحقول الناقصة" items={reply.missingFields} />}
              <Checklist title="التحذيرات" items={reply.warnings} />
              <div className="next-step"><strong>الخطوة التالية:</strong> {reply.suggestedNextAction}</div>
            </>
          )}
          <div className="action-row no-print">
            <button className="secondary" disabled={!reply} onClick={() => reply && copyText(reply.subject, "تم نسخ الموضوع.")}><Clipboard size={17} /> نسخ الموضوع</button>
            <button className="secondary" disabled={!reply} onClick={() => reply && copyText(reply.body, "تم نسخ الرد.")}><Clipboard size={17} /> نسخ الرد</button>
            <button className="secondary" disabled={!reply} onClick={downloadReply}><Download size={17} /> تحميل .txt</button>
            <button className="secondary" onClick={() => window.print()}><Printer size={17} /> طباعة / PDF</button>
            <button className="secondary" disabled={!reply} onClick={() => saveCase(reply)}>حفظ ضمن ملف المتابعة</button>
          </div>
        </section>
      )}

      <section className="panel limits-panel">
        <div className="section-title"><AlertTriangle size={22} /><h2>حدود النسخة الحالية</h2></div>
        <ul>
          <li>OCR الويب تجريبي.</li>
          <li>القراءة الأعلى دقة للهاتف ضمن خطة Android المحلية.</li>
          <li>التحليل مساعد أولي وليس قرارًا رسميًا أو استشارة قانونية.</li>
        </ul>
      </section>

      <section className="panel">
        <div className="section-title"><CheckCircle2 size={22} /><h2>ملفاتي</h2></div>
        {cases.length === 0 ? <p className="empty">لا توجد ملفات متابعة محفوظة بعد.</p> : (
          <div className="case-list">
            {cases.map((item) => <CaseCard key={item.id} item={item} updateStatus={updateStatus} deleteCase={deleteCase} copyText={copyText} />)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-title"><CalendarClock size={22} /><h2>مواعيد قريبة</h2></div>
        {reminders.length === 0 ? <p className="empty">لا توجد تذكيرات محلية حاليًا.</p> : reminders.map((item) => <p className="reminder" key={item.id}>{item.analysis.title}: {item.analysis.deadline}</p>)}
      </section>
    </main>
  );
}

function CaseCard({ item, updateStatus, deleteCase, copyText }: { item: CaseFile; updateStatus: (id: string, status: CaseStatus) => void; deleteCase: (id: string) => void; copyText: (value: string, message?: string) => Promise<void> }) {
  const created = new Intl.DateTimeFormat("ar-JO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt));
  const summary = `${item.analysis.title}\nالرقم: ${item.analysis.referenceNumber}\nالمهلة: ${item.analysis.deadline}\nأفضل خطوة: ${item.analysis.nextBestStep}`;
  return (
    <article className="case-card">
      <div>
        <h3>{item.analysis.title}</h3>
        <p>أُنشئ: {created}</p>
        <p>أفضل خطوة: {item.analysis.nextBestStep}</p>
      </div>
      <RiskBadge risk={item.analysis.riskLevel} />
      <select value={item.status} onChange={(event) => updateStatus(item.id, event.target.value as CaseStatus)}>
        <option>جديد</option>
        <option>قيد المتابعة</option>
        <option>تم الإجراء</option>
      </select>
      <button className="secondary" onClick={() => copyText(summary, "تم نسخ الملخص.")}>نسخ الملخص</button>
      <button className="danger" onClick={() => deleteCase(item.id)}><Trash2 size={16} /> حذف</button>
    </article>
  );
}

function VehicleTransferFields({ form }: { form: VehicleTransferFormResult }) {
  const fields = form.extractedFields;
  const rows = [
    ["صفة التسجيل", fields.registrationType],
    ["الرقم الوطني للمشتري", maskSensitiveValue(fields.buyerNationalId, "nationalId")],
    ["اسم المشتري", fields.buyerName],
    ["تاريخ الولادة", fields.birthDate],
    ["اسم الأم", fields.motherName],
    ["الجنسية", fields.nationality],
    ["المحافظة", fields.addressGovernorate],
    ["رقم الهاتف", maskSensitiveValue(fields.phone, "phone")],
    ["نوع وثيقة المشتري", fields.buyerDocumentType],
    ["رقم وثيقة المشتري", maskSensitiveValue(fields.buyerDocumentNumber, "document")],
    ["اسم البائع", fields.sellerName],
    ["نوع وثيقة البائع", fields.sellerDocumentType],
    ["رقم وثيقة البائع", maskSensitiveValue(fields.sellerDocumentNumber, "document")],
    ["رقم سند", maskSensitiveValue(fields.bondNumber, "document")],
  ];

  return (
    <div className="form-table">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value || "غير واضح"}</strong>
        </div>
      ))}
    </div>
  );
}

function DocumentFields({ fields }: { fields: ExtractedDocumentField[] }) {
  if (!fields.length) return <p className="empty">لم يتم استخراج حقول واضحة بعد. راجع النص يدويًا.</p>;
  return (
    <div className="form-table">
      {fields.map((field) => (
        <div key={`${field.key}-${field.label}`}>
          <span>{field.label}{field.sensitive ? " · مخفي جزئيًا" : ""}</span>
          <strong>{field.maskedValue ?? field.value}</strong>
          <small>ثقة {field.confidence}%</small>
        </div>
      ))}
    </div>
  );
}

function vehicleFormToDocumentFields(form: VehicleTransferFormResult): ExtractedDocumentField[] {
  const f = form.extractedFields;
  const rows: Array<[string, string, string | undefined, boolean, Parameters<typeof maskSensitiveValue>[1]]> = [
    ["registrationType", "صفة التسجيل", f.registrationType, false, "text"],
    ["buyerNationalId", "الرقم الوطني للمشتري", f.buyerNationalId, true, "nationalId"],
    ["buyerName", "اسم المشتري", f.buyerName, false, "text"],
    ["birthDate", "تاريخ الولادة", f.birthDate, false, "text"],
    ["motherName", "اسم الأم", f.motherName, false, "text"],
    ["nationality", "الجنسية", f.nationality, false, "text"],
    ["addressGovernorate", "المحافظة", f.addressGovernorate, false, "text"],
    ["phone", "رقم الهاتف", f.phone, true, "phone"],
    ["buyerDocumentType", "نوع وثيقة المشتري", f.buyerDocumentType, false, "text"],
    ["buyerDocumentNumber", "رقم وثيقة المشتري", f.buyerDocumentNumber, true, "document"],
    ["sellerName", "اسم البائع", f.sellerName, false, "text"],
    ["sellerDocumentType", "نوع وثيقة البائع", f.sellerDocumentType, false, "text"],
    ["sellerDocumentNumber", "رقم وثيقة البائع", f.sellerDocumentNumber, true, "document"],
    ["bondNumber", "رقم سند", f.bondNumber, true, "document"],
  ];
  return rows.filter(([, , value]) => !!value).map(([key, label, value, sensitive, type]) => ({
    key,
    label,
    value: value ?? "",
    maskedValue: sensitive ? maskSensitiveValue(value, type) : undefined,
    confidence: form.confidenceScore,
    sensitive,
  }));
}

function TemplateLibrary() {
  const categories = [...new Set(documentTemplates.filter((item) => item.id !== "unknown").map((item) => item.category))];
  return (
    <section className="panel template-library">
      <div className="section-title"><CheckCircle2 size={22} /><h2>القوالب التي يدعمها وثيقتك</h2></div>
      {categories.map((category) => (
        <div className="template-group" key={category}>
          <h3>{category}</h3>
          <div className="template-grid">
            {documentTemplates.filter((template) => template.category === category && template.id !== "unknown").map((template) => (
              <article key={template.id}>
                <strong>{template.arabicName}</strong>
                <p>يستخرج: {template.expectedFields.slice(0, 4).join("، ") || "حقول عامة"}</p>
                <span>{template.sensitiveFields.length ? "يحتوي بيانات حساسة" : "لا توجد حساسية عالية غالبًا"}</span>
                <small>{template.id === "medical-report" || template.id === "court-or-legal-notice" ? "يحتاج OCR أوضح" : template.id === "passport" || template.id === "vehicle-license" ? "ضمن خطة Android المحلية" : "مدعوم نصيًا"}</small>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-box"><span>{label}</span><strong>{value}</strong></div>;
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return <div className="checklist"><h3>{title}</h3><ol>{items.map((item) => <li key={item}>{item}</li>)}</ol></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
