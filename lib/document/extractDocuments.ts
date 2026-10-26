import { extractPdfText } from './extraction/extractPdfText';
import { extractClaims } from './citations/extract-claims';
//import { extractClaims } from './citations/extractClaims.js';
import { parseReferences } from './citations/parseReferences';
import type { DocumentInput, ExtractedDocument, ExtractionWarning } from './types.ts';

export const MAX_TEXT_LENGTH = 2_000_000;
export const MAX_TEXT_INPUT_LENGTH = 5_000_000;

export async function extractDocument(input: DocumentInput): Promise<ExtractedDocument> {
  const warnings: ExtractionWarning[] = [];
  let text = '';
  if (input.type === 'text') {
    if (input.text.length > MAX_TEXT_INPUT_LENGTH) {
      warnings.push({ code: 'INPUT_TOO_LARGE', message: `Text input exceeds the ${MAX_TEXT_INPUT_LENGTH.toLocaleString()} character input limit.` });
      text = input.text.slice(0, MAX_TEXT_INPUT_LENGTH);
    } else text = input.text;
  } else {
    const result = await extractPdfText(input.data);
    text = result.text;
    warnings.push(...result.warnings);
  }
  let truncated = false;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    truncated = true;
    warnings.push({ code: 'TEXT_TRUNCATED', message: `Extracted text exceeded ${MAX_TEXT_LENGTH.toLocaleString()} characters and was truncated; results may be incomplete.` });
  }
  if (!text.trim()) warnings.push({ code: input.type === 'text' ? 'EMPTY_TEXT' : 'PDF_EMPTY', message: 'No document text was available to analyze.' });
  const parsed = parseReferences(text);
  warnings.push(...parsed.warnings);
  const { claims, warnings: claimWarnings } = extractClaims(parsed.bodyText);
  warnings.push(...claimWarnings);
  const referenceIds = new Set(parsed.references.map((r) => r.id));
  for (const claim of claims) {
    for (const id of claim.citationIds) {
      if (!referenceIds.has(id)) warnings.push({ code: 'UNRESOLVED_CITATION', message: `Citation [${id}] has no matching numbered bibliography entry.`, details: { claimId: claim.id, citationId: id } });
    }
  }
  // Deduplicate identical unresolved warnings caused by repeated citations while preserving first occurrence.
  const uniqueWarnings = warnings.filter((w, i, all) => all.findIndex((x) => x.code === w.code && x.message === w.message) === i);
  return { text, claims, references: parsed.references, warnings: uniqueWarnings, source: input.type, truncated };
}

export type { DocumentInput, ExtractedDocument, Claim, BibliographyEntry, ExtractionWarning } from './types.ts';
