import type { MobileOcrMode } from "./mobileOcrStrategy";

export async function runNativeMobileOcr(_file: File, _mode: MobileOcrMode): Promise<string> {
  throw new Error("محرك OCR المحلي للهاتف يحتاج نسخة Android مدمجة.");
}
