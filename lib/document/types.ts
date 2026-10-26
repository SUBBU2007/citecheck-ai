/** Standalone Member 2 contract. Reconcile names with the shared app types at integration. */
export type DocumentInput =
  | { type: 'text'; text: string; filename?: string }
  | { type: 'pdf'; data: Uint8Array | ArrayBuffer; filename?: string };

export interface CitationMarker {
  raw: string;
  start: number;
  end: number;
  referenceIds: string[];
}

export interface Claim {
  id: string;
  text: string;
  citationIds: string[];
  citations: CitationMarker[];
}

export interface BibliographyEntry {
  id: string;
  raw: string;
  title?: string;
  doi?: string;
  urls: string[];
}

export interface ExtractionWarning {
  code:
    | 'EMPTY_TEXT' | 'TEXT_TRUNCATED' | 'INPUT_TOO_LARGE' | 'PDF_EMPTY'
    | 'PDF_SCANNED_OR_IMAGE_ONLY' | 'PDF_MALFORMED' | 'PDF_ENCRYPTED'
    | 'PDF_UNSUPPORTED' | 'REFERENCES_NOT_FOUND' | 'UNRESOLVED_CITATION'
    | 'DUPLICATE_REFERENCE_ID' | 'UNCERTAIN_REFERENCE_PARSE' | 'UNCERTAIN_CITATION_PARSE';
  message: string;
  details?: Record<string, unknown>;
}

export interface ExtractedDocument {
  text: string;
  claims: Claim[];
  references: BibliographyEntry[];
  warnings: ExtractionWarning[];
  source: 'text' | 'pdf';
  truncated: boolean;
}
