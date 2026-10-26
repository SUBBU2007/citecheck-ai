export interface Reference {
  referenceId: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
}

export interface ExtractedClaim {
  claimId?: string;
  text: string;
}

export type MatchStatus =
  | "exact_doi"
  | "strong_match"
  | "ambiguous"
  | "no_match";

export type RetrievalStatus =
  | "available"
  | "partial"
  | "unavailable";

export type EvidenceLevel =
  | "full_text"
  | "abstract"
  | "metadata"
  | "other"
  | "none";

export interface SourceCandidate {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  sourceUrl?: string;
  landingPageUrl?: string;
  publisher?: string;
  journal?: string;
  abstract?: string;
  openAccessUrl?: string;
}

export interface ResolvedSource extends SourceCandidate {
  referenceId: string;
  matchStatus: MatchStatus;
  confidence: number;
  alternatives?: SourceCandidate[];
  limitations: string[];
}

export interface EvidenceExcerpt {
  text: string;
  evidenceLevel: EvidenceLevel;
  section?: string;
  sourceUrl: string;
}

export interface SourceEvidence {
  referenceId: string;
  title?: string;
  sourceUrl?: string;
  doi?: string;
  retrievalStatus: RetrievalStatus;
  evidenceLevel: EvidenceLevel;
  evidenceText: EvidenceExcerpt[];
  limitations: string[];
}
