import type {
  ExtractedClaim,
  SourceEvidence,
  VerificationEvidence,
  VerificationResult,
} from '../../types/index.js';
import { findDiscrepancySignals } from './discrepancy-checks';
import { GeminiVerificationModel, ModelConfigurationError, type VerificationModel } from './model-adapter';
import { buildVerificationPrompt, toEvidencePassages } from './prompt';
import { modelDecisionSchema } from './schema';

export interface VerifyClaimOptions {
  /** Inject a deterministic mock in tests; production defaults to Gemini. */
  model?: VerificationModel;
  timeoutMs?: number;
}

const FALLBACK_EXPLANATION = 'The verification engine could not produce a validated evidence-based assessment.';

function unverifiable(claimId: string, explanation: string, limitations: string[], evidence: VerificationEvidence[] = []): VerificationResult {
  return {
    claimId,
    verdict: 'unverifiable',
    explanation,
    evidence,
    limitations: [...new Set(limitations)].slice(0, 12),
  };
}

function isValidInput(claim: ExtractedClaim, evidence: SourceEvidence[]): boolean {
  return Boolean(
    claim && typeof claim.id === 'string' && claim.id.trim() &&
    typeof claim.text === 'string' && claim.text.trim() &&
    Array.isArray(claim.citationIds) && claim.citationIds.every((id) => typeof id === 'string') &&
    Array.isArray(evidence) && evidence.every((item) =>
      item && typeof item.referenceId === 'string' &&
      Array.isArray(item.evidenceText) && item.evidenceText.every((passage) => typeof passage === 'string') &&
      ['available', 'partial', 'unavailable'].includes(item.retrievalStatus) &&
      Array.isArray(item.limitations) && item.limitations.every((limitation) => typeof limitation === 'string')
    )
  );
}

/**
 * Verify one claim against the exact source passages returned by retrieval.
 * The model chooses source passage indexes; only this function copies original excerpts into output.
 */
export async function verifyClaim(
  claim: ExtractedClaim,
  evidence: SourceEvidence[],
  options: VerifyClaimOptions = {},
): Promise<VerificationResult> {
  if (!isValidInput(claim, evidence)) {
    const safeId = claim && typeof claim.id === 'string' ? claim.id : 'unknown';
    return unverifiable(safeId, 'The claim input is missing a valid identifier, text, citation list, or evidence array.', ['Invalid verification input.']);
  }

  // Only assess sources actually attached to this claim; do not accidentally use unrelated document evidence.
  const citedEvidence = evidence.filter((item) => claim.citationIds.includes(item.referenceId));
  const { passages, unavailableReferenceIds } = toEvidencePassages(citedEvidence);
  const baseLimitations = citedEvidence.flatMap((item) => item.limitations).filter(Boolean).slice(0, 8);

  if (passages.length === 0) {
    const noMatch = citedEvidence.length === 0;
    return unverifiable(
      claim.id,
      'No usable cited-source passages were supplied, so the claim cannot be reliably assessed.',
      [...baseLimitations, noMatch
        ? 'No supplied source evidence matched this claim’s citation IDs.'
        : unavailableReferenceIds.length
          ? `Unavailable or empty sources: ${unavailableReferenceIds.join(', ')}.`
          : 'No accessible evidence passages were provided.'],
    );
  }

  const signals = findDiscrepancySignals(claim.text, passages.map((passage) => passage.text));
  const prompt = buildVerificationPrompt(claim, passages, signals, unavailableReferenceIds);
  const model = options.model ?? new GeminiVerificationModel();

  let raw: string;
  try {
    raw = await model.generate(prompt, { timeoutMs: options.timeoutMs });
  } catch (error) {
    const isConfig = error instanceof ModelConfigurationError;
    const reason = isConfig
      ? error.message
      : error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`)
        ? 'The model request timed out.'
        : 'The model request failed or the provider was unavailable.';
    return unverifiable(claim.id, FALLBACK_EXPLANATION, [...baseLimitations, reason, 'No model verdict was accepted because no validated response was available.']);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return unverifiable(claim.id, FALLBACK_EXPLANATION, [...baseLimitations, 'The model response was malformed JSON and failed validation.']);
  }

  const parsed = modelDecisionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return unverifiable(claim.id, FALLBACK_EXPLANATION, [...baseLimitations, 'The model response did not match the required verification schema.']);
  }

  const selected: VerificationEvidence[] = [];
  const seen = new Set<string>();
  for (const selection of parsed.data.evidenceSelections) {
    const passage = passages.find((item) => item.referenceId === selection.referenceId && item.evidenceIndex === selection.evidenceIndex);
    if (!passage) {
      return unverifiable(claim.id, FALLBACK_EXPLANATION, [...baseLimitations, 'The model selected an evidence reference or passage index that was not present in the supplied source evidence.']);
    }
    const key = `${passage.referenceId}\u0000${passage.evidenceIndex}`;
    if (!seen.has(key)) {
      selected.push({ referenceId: passage.referenceId, excerpt: passage.text });
      seen.add(key);
    }
  }

  // A non-unverifiable verdict without any auditable passage is not safe to return.
  if (parsed.data.verdict !== 'unverifiable' && selected.length === 0) {
    return unverifiable(claim.id, FALLBACK_EXPLANATION, [...baseLimitations, 'The model returned a decisive verdict without selecting any supplied evidence passage.']);
  }

  const limitations = [...baseLimitations, ...parsed.data.limitations];
  if (signals.length) limitations.push(...signals);
  if (unavailableReferenceIds.length) limitations.push(`Some cited sources were unavailable or had no usable passage: ${unavailableReferenceIds.join(', ')}.`);

  return {
    claimId: claim.id,
    verdict: parsed.data.verdict,
    explanation: parsed.data.explanation,
    evidence: selected,
    limitations: [...new Set(limitations)].slice(0, 12),
  };
}
