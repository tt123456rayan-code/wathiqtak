import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CalendarClock, CheckCircle2, Clipboard, Download, FileText, LockKeyhole, MessageSquareText, Printer, Trash2, Upload } from "lucide-react";
import { localRulesProvider } from "./lib/aiProvider";
import { extractTextFromImage } from "./lib/ocrEngine";
import { analyzeDocumentImageQuality, prepareImageForWeakDevice, type ImageQualityReport } from "./lib/imageQuality";
import { buildImageProcessingPlan, detectDeviceTier, selectMobileOcrMode, type MobileOcrMode } from "./lib/mobileOcrStrategy";
import type { LetterAnalysis, RiskLevel } from "./lib/analysisEngine";
import { composeOfficialReply, type ComposedOfficialReply, type ReplyTone } from "./lib/replyComposer";
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
    text: "وزارة الصحة، هام وعاجل، أرجو تزويدي بقوائم أسماء الموظفين على رأس عملهم والموظفين ممن لم يكونوا على رأس عملهم، على أن تكون الكشوفات Excel Sheet ونسخة ورقية وإلكترونية مع تصديق الكشوفات من المسؤول، وذلك بالسرعة الممكنة.",
  },
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
  const [qualityReport, setQualityReport] = useState<ImageQualityReport | null>(null);
  const [isQualityChecking, setIsQualityChecking] = useState(false);
  const [allowPoorImageOcr, setAllowPoorImageOcr] = useState(false);
  const [selectedMobileOcrMode, setSelectedMobileOcrMode] = useState<MobileOcrMode>(() => selectMobileOcrMode());
  const [analysis, setAnalysis] = useState<LetterAnalysis | null>(null);
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
    const result = await localRulesProvider.analyzeGovernmentLetter(customText);
    setAnalysis(result);
    setReply(null);
    setReplyReferenceNumber(result.referenceNumber !== "غير مذكور" ? result.referenceNumber : "");
    setReplyTargetAgency(result.agency !== "جهة حكومية غير محددة" ? result.agency : "");
    setReplyAttachments(result.requiredDocuments.join("\n"));
    setIsReplyComposerOpen(false);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function runDemo(sample: string) {
    setInputMode("text");
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
      setText(extracted);
      setNotice("تم استخراج النص من الصورة.");
      if (autoAnalyzeAfterOcr) await analyze(extracted);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "تعذر استخراج النص من الصورة.");
    } finally {
      setIsOcrRunning(false);
    }
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

      <section className="panel demo-panel">
        <div className="section-title"><CheckCircle2 size={22} /><h2>جرّب سيناريو العرض</h2></div>
        <div className="demo-grid">
          {demoScenarios.map((sample) => <button key={sample.label} className="demo-card" onClick={() => runDemo(sample.text)}>{sample.label}</button>)}
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
                  {qualityReport?.level === "poor" && <button className="secondary" onClick={() => runDemo(demoScenarios[3].text)}>جرّب مثال وزارة الصحة</button>}
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
            <button className="primary" onClick={runOcr} disabled={!selectedImage || isOcrRunning}>{isOcrRunning ? "جاري استخراج النص..." : "استخراج النص من الصورة"}</button>
            <p>قد يحتاج OCR إلى إنترنت أول مرة لتحميل ملفات اللغة، لكن الصورة والنص لا يتم رفعهما لأي خادم.</p>
            {(isOcrRunning || ocrProgress > 0) && (
              <div className="ocr-progress">
                <span>{ocrStatus || "جاري قراءة الصورة..."} · {ocrProgress}%</span>
                <div><i style={{ width: `${Math.max(3, ocrProgress)}%` }} /></div>
              </div>
            )}
            {ocrError && <p className="ocr-error">{ocrError}</p>}
            <p>قد تختلف دقة قراءة النص حسب وضوح الصورة. يمكنك تعديل النص المستخرج قبل إنشاء الرد الرسمي.</p>
          </div>
        )}
        <textarea id="letter-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="ألصق نص الكتاب أو الرسالة الحكومية هنا..." />
        {inputMode === "image" && text.trim() && <div className="extracted-card">النص المستخرج جاهز للمراجعة والتعديل قبل التحليل.</div>}
        {inputMode === "image" && text.trim() && !autoAnalyzeAfterOcr && <button className="secondary" onClick={() => analyze()}>حلّل النص المستخرج</button>}
        <button className="primary" onClick={() => analyze()}>حلّل الكتاب</button>
      </section>

      {analysis && (
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

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-box"><span>{label}</span><strong>{value}</strong></div>;
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return <div className="checklist"><h3>{title}</h3><ol>{items.map((item) => <li key={item}>{item}</li>)}</ol></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
