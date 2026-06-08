# Android Native OCR Plugin Roadmap

1. إضافة Capacitor لاحقًا بدون تغيير واجهة الويب.
2. إنشاء Android plugin باسم `IstidrakOcrPlugin`.
3. تمرير الصورة من React إلى Native عبر مسار ملف أو URI آمن.
4. تنفيذ pre-processing على Android: resize, grayscale, contrast, optional deskew.
5. تشغيل PaddleOCR Mobile عبر Paddle Lite أو ONNX Runtime Mobile.
6. إرجاع النص فقط إلى الواجهة.
7. إبقاء التحليل في `analysisEngine` داخل React.
8. إضافة اختبارات أداء على أجهزة ضعيفة ومتوسطة وقوية.

لا Cloud API، لا backend، ولا رفع صور.
