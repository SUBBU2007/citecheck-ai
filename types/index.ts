
export type Verdict =
  | "supported"
  | "weakly_supported"
  | "mismatched"
  | "unverifiable";

export interface DocumentInput {
  text?: string;
  fileName?: string;
  fileType?: "pdf" | "text" | "docx";
}

export interface ExtractedClaim {
  id: string;
  text: string;
  citationIds: string[];
}

export interface Reference {
  id: string;
  rawText: string;
  doi?: string;
  url?: string;
  title?: string;
}

export interface ExtractedDocument {
  text: string;
  claims: ExtractedClaim[];
  references: Reference[];
  warnings: string[];
}

export interface ResolvedSource {
  referenceId: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  sourceUrl?: string;
  retrievalStatus: "available" | "partial" | "unavailable";
}

export interface SourceEvidence {
  referenceId: string;
  title?: string;
  sourceUrl?: string;
  evidenceText: string[];
  retrievalStatus: "available" | "partial" | "unavailable";
  limitations: string[];
}

export interface VerificationEvidence {
  referenceId: string;
  excerpt: string;
}

export interface VerificationResult {
  claimId: string;
  verdict: Verdict;
  explanation: string;
  evidence: VerificationEvidence[];
  limitations: string[];
}

export interface ClaimReport {
  claim: ExtractedClaim;
  references: Reference[];
  sources: SourceEvidence[];
  verification: VerificationResult;
}
