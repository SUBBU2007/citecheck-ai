import type { Claim, CitationMarker, ExtractionWarning } from '../types.js';

// Restrict citation-like brackets to compact numeric lists/ranges; ordinary [2024] etc. are handled conservatively.
const CITATION_RE = /\[(\s*\d{1,4}(?:\s*(?:,|;|[-–])\s*\d{1,4})*\s*)\]/g;
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'vs.', 'fig.', 'eq.', 'dr.', 'prof.', 'mr.', 'mrs.', 'ms.', 'no.', 'approx.', 'et al.']);

function expandCitation(raw: string): string[] {
  const ids: string[] = [];
  for (const part of raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*([-–])\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]); const end = Number(range[3]);
      if (end >= start && end - start <= 50) for (let n = start; n <= end; n++) ids.push(String(n));
      else ids.push(part.replace(/\s/g, ''));
    } else if (/^\d+$/.test(part)) ids.push(part);
  }
  return [...new Set(ids)];
}

function sentenceRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?]/.test(text[i]!)) continue;
    const prefix = text.slice(Math.max(start, i - 12), i + 1).toLowerCase();
    if ([...ABBREVIATIONS].some((a) => prefix.endsWith(a))) continue;
    // Do not split at the first dot in e.g. / i.e.
    if (text[i] === '.' && /[ei]/i.test(text[i - 1] ?? '') && /^[g.]\./i.test(text.slice(i + 1, i + 3))) continue;
    if (text[i] === '.' && i > 0 && i + 1 < text.length && /\d/.test(text[i - 1]!) && /\d/.test(text[i + 1]!)) continue;
    if (i + 1 < text.length && !/\s|[\])}"']/.test(text[i + 1]!)) continue;
    let end = i + 1;
    while (end < text.length && /[\])}"']/.test(text[end]!)) end++;
    if (text.slice(start, end).trim()) ranges.push({ start, end });
    start = end;
  }
  if (text.slice(start).trim()) ranges.push({ start, end: text.length });
  return ranges;
}

export function extractClaims(text: string): { claims: Claim[]; warnings: ExtractionWarning[] } {
  const warnings: ExtractionWarning[] = [];
  const markers: CitationMarker[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const raw = match[0]; const start = match.index ?? 0;
    const inner = (match[1] ?? '').trim();
    // A standalone four-digit year in brackets is commonly a form/table value, not a reference.
    if (/^\d{4}$/.test(inner) && Number(inner) >= 1800 && Number(inner) <= 2099) continue;
    const ids = expandCitation(inner);
    if (!ids.length) continue;
    // Avoid treating compact numeric labels in tables/standalone lines as claims.
    markers.push({ raw, start, end: start + raw.length, referenceIds: ids });
  }
  const claims: Claim[] = [];
  for (const range of sentenceRanges(text)) {
    const citations = markers.filter((m) => m.start >= range.start && m.start < range.end);
    if (!citations.length) continue;
    const claimText = text.slice(range.start, range.end).trim();
    if (!/[A-Za-z\p{L}]/u.test(claimText)) continue;
    claims.push({
      id: `claim-${claims.length + 1}`,
      text: claimText,
      citationIds: [...new Set(citations.flatMap((c) => c.referenceIds))],
      citations: citations.map((c) => ({ ...c, start: c.start - range.start, end: c.end - range.start })),
    });
  }
  if (markers.length && !claims.length) warnings.push({ code: 'UNCERTAIN_CITATION_PARSE', message: 'Citation markers were found, but no citation-bearing sentences could be confidently segmented.' });
  return { claims, warnings };
}
