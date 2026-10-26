import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString();
//import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractionWarning } from '../types.ts';

export interface PdfTextResult { text: string; warnings: ExtractionWarning[] }
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function extractPdfText(data: Uint8Array | ArrayBuffer): Promise<PdfTextResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { text: '', warnings: [{ code: 'INPUT_TOO_LARGE', message: `PDF exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB input limit.` }] };
  }
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return { text: '', warnings: [{ code: 'PDF_UNSUPPORTED', message: 'Input does not have a recognizable PDF header.' }] };
  }
  try {
    const task = getDocument({
      data: bytes,
      useSystemFonts: true,
    });
    //const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
    const pdf = await task.promise;
    const pages: string[] = [];
    let textItems = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
      textItems += items.filter((item) => typeof item.str === 'string' && item.str.trim()).length;
      let line = '';
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) { pages.push(line); line = ''; }
        else if (item.str && !/\s$/.test(item.str)) line += ' ';
      }
      if (line.trim()) pages.push(line);
      pages.push('');
    }
    const text = pages.join('\n').replace(/[\t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const warnings: ExtractionWarning[] = [];
    if (!text.trim() || textItems === 0) {
      warnings.push({ code: 'PDF_SCANNED_OR_IMAGE_ONLY', message: 'No selectable text was found; this PDF may be scanned or image-only. OCR is not supported.' });
    }
    return { text, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const encrypted = /password|encrypt/i.test(message);
    return {
      text: '',
      warnings: [{
        code: encrypted ? 'PDF_ENCRYPTED' : 'PDF_MALFORMED',
        message: encrypted ? 'PDF is encrypted or password-protected; extraction could not continue.' : `PDF text extraction failed: ${message}`,
      }],
    };
  }
}
