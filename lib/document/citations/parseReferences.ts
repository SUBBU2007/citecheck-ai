import type { BibliographyEntry, ExtractionWarning } from '../types.ts';

const HEADING_RE = /^\s*(references|bibliography|works\s+cited)\s*:?\s*$/im;
const NUMERIC_START_RE = /^\s*(?:\[(\d{1,4})\]|(\d{1,4})[.)])\s+(.+)$/;

export interface ParsedReferences { references: BibliographyEntry[]; bodyText: string; warnings: ExtractionWarning[] }

function cleanEntry(raw: string): string { return raw.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseEntry(id: string, raw: string): BibliographyEntry {
  const normalized = cleanEntry(raw);
  const doiMatch = normalized.match(/\b(?:https?:\/\/doi\.org\/|doi\s*:\s*)(10\.\d{4,9}\/[\w.()/:;-]+)/i);
  const urls = [...normalized.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((m) => m[0].replace(/[.,;]+$/, ''));
  const withoutLabel = normalized.replace(/^\s*(?:\[\d+\]|\d+[.)])\s+/, '');
  // Conservative title heuristic: quoted title or title-like phrase between author/year punctuation.
  const quoted = withoutLabel.match(/[“"]([^”"]{8,220})[”"]/);
  let title = quoted?.[1]?.trim();
  if (!title) {
    const year = withoutLabel.search(/\b(?:19|20)\d{2}[a-z]?\b/);
    if (year > 0) {
      const beforeYear = withoutLabel.slice(0, year).replace(/[,.;:]\s*$/, '').trim();
      const afterYear = withoutLabel.slice(year).replace(/^\b(?:19|20)\d{2}[a-z]?\b[,.;:]?\s*/i, '');
      const candidate = afterYear.split(/\.\s|\b(?:doi:|https?:\/\/)/i)[0]?.replace(/\s+/g, ' ').trim();
      if (candidate && candidate.length >= 8 && candidate.length <= 220 && !/^[A-Z][a-z]+,\s+[A-Z]/.test(candidate)) title = candidate.replace(/[.;,]+$/, '');
      else if (beforeYear.length >= 8 && beforeYear.length <= 180) title = undefined;
    }
  }
  return { id, raw: normalized, ...(title ? { title } : {}), ...(doiMatch ? { doi: doiMatch[1] } : {}), urls };
}

export function parseReferences(text: string): ParsedReferences {
  const warnings: ExtractionWarning[] = [];
  const heading = HEADING_RE.exec(text);
  if (!heading || heading.index === undefined) {
    return { references: [], bodyText: text, warnings: [{ code: 'REFERENCES_NOT_FOUND', message: 'No References, Bibliography, or Works Cited heading was found.' }] };
  }
  const headingStart = heading.index;
  const headingEnd = headingStart + heading[0].length;
  const bodyText = text.slice(0, headingStart).trimEnd();
  const section = text.slice(headingEnd).trim();
  const lines = section.split(/\r?\n/);
  const entries: Array<{ id: string; raw: string }> = [];
  let current: { id: string; raw: string } | undefined;
  for (const line of lines) {
    const match = NUMERIC_START_RE.exec(line);
    if (match) {
      if (current) entries.push(current);
      current = { id: match[1] ?? match[2]!, raw: match[3]! };
    } else if (current && line.trim()) {
      // Wrapped entry continuation. Stop if another section heading appears.
      if (/^\s*[A-Z][\w\s-]{1,40}:\s*$/.test(line)) { entries.push(current); current = undefined; break; }
      current.raw += `\n${line.trim()}`;
    } else if (line.trim() && !current) {
      warnings.push({ code: 'UNCERTAIN_REFERENCE_PARSE', message: 'Some bibliography lines did not begin with a numeric reference ID.', details: { line: line.trim().slice(0, 120) } });
    }
  }
  if (current) entries.push(current);
  const seen = new Set<string>();
  const references = entries.map(({ id, raw }) => {
    if (seen.has(id)) warnings.push({ code: 'DUPLICATE_REFERENCE_ID', message: `Reference ID "${id}" appears more than once.`, details: { id } });
    seen.add(id);
    return parseEntry(id, raw);
  });
  if (!references.length) warnings.push({ code: 'UNCERTAIN_REFERENCE_PARSE', message: 'A bibliography heading was found, but no numbered entries could be parsed.' });
  return { references, bodyText, warnings };
}
