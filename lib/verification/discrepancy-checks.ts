/** Lightweight signals for the model. These are never standalone proof of mismatch. */
const NUMBER_PATTERN = /(?<![\w])[-+]?\d+(?:[,.]\d+)*(?:\s?%|\s?(?:percent|percentage|ms|s|seconds?|minutes?|hours?|days?|years?|MB|GB|TB|KB|cm|mm|km|m|kg|g|°C|K))?/gi;
const DATASET_PATTERN = /\b(?:CIFAR[- ]?10|CIFAR[- ]?100|ImageNet|MNIST|COCO|SQuAD|GLUE|IMDb|IMDB|WikiText(?:-\d+)?|PubMed)\b/gi;

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return [...new Set(text.match(pattern)?.map(normalizeToken) ?? [])];
}

export function findDiscrepancySignals(claimText: string, evidenceTexts: string[]): string[] {
  const signals: string[] = [];
  const claimNumbers = uniqueMatches(claimText, NUMBER_PATTERN);
  const claimDatasets = uniqueMatches(claimText, DATASET_PATTERN);
  const evidence = evidenceTexts.join('\n');
  const evidenceNumbers = uniqueMatches(evidence, NUMBER_PATTERN);
  const evidenceDatasets = uniqueMatches(evidence, DATASET_PATTERN);

  if (claimNumbers.length && evidenceNumbers.length) {
    const missing = claimNumbers.filter((value) => !evidenceNumbers.includes(value));
    if (missing.length) {
      signals.push(`Claim numeric tokens not found as exact normalized tokens in supplied passages: ${missing.join(', ')}. This is a comparison signal only; values may be expressed differently or refer to different conditions.`);
    }
  }

  if (claimDatasets.length && evidenceDatasets.length) {
    const missing = claimDatasets.filter((value) => !evidenceDatasets.includes(value));
    if (missing.length) {
      signals.push(`Claim dataset tokens not found in supplied passages: ${missing.join(', ')}. This is not proof of mismatch; the evidence may use aliases or discuss a separate experiment.`);
    }
  }

  return signals;
}
