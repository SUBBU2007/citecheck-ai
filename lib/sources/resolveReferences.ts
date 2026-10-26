import {
  searchCrossrefByDoi,
  searchCrossrefByTitle,
} from "./crossref";

import type {
  Reference,
  ResolvedSource,
  SourceCandidate,
} from "./types";

import { validateExternalUrl } from "./urlSafety";

interface ScoredCandidate {
  candidate: SourceCandidate;
  score: number;
  reasons: string[];
  titleScore: number;
  authorsScore: number;
  yearConflict: boolean;
  doiConflict: boolean;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDoi(value?: string): string | undefined {
  if (!value) return undefined;

  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "")
    .toLowerCase();
}

function titleSimilarity(a: string, b: string): number {
  const first = normalizeText(a);
  const second = normalizeText(b);

  if (!first || !second) return 0;
  if (first === second) return 1;

  const firstWords = new Set(first.split(" "));
  const secondWords = new Set(second.split(" "));

  let intersection = 0;

  for (const word of firstWords) {
    if (secondWords.has(word)) intersection++;
  }

  const union = new Set([...firstWords, ...secondWords]).size;

  return union === 0 ? 0 : intersection / union;
}

function authorSimilarity(
  expected: string[] = [],
  actual: string[] = []
): number {
  if (expected.length === 0 || actual.length === 0) {
    return 0;
  }

  const normalizedActual = actual.map(normalizeText);
  let matches = 0;

  for (const author of expected) {
    const normalizedExpected = normalizeText(author);

    if (
      normalizedActual.some(
        (candidate) =>
          candidate === normalizedExpected ||
          candidate.endsWith(` ${normalizedExpected}`) ||
          normalizedExpected.endsWith(` ${candidate}`)
      )
    ) {
      matches++;
    }
  }

  return matches / expected.length;
}

function scoreCandidate(
  reference: Reference,
  candidate: SourceCandidate
): ScoredCandidate {
  const reasons: string[] = [];

  const expectedDoi = normalizeDoi(reference.doi);
  const actualDoi = normalizeDoi(candidate.doi);

  const titleScore = reference.title
    ? titleSimilarity(reference.title, candidate.title)
    : 0;

  const authorsScore = authorSimilarity(
    reference.authors,
    candidate.authors
  );

  const yearConflict =
    reference.year !== undefined &&
    candidate.year !== undefined &&
    reference.year !== candidate.year;

  const doiConflict =
    Boolean(expectedDoi && actualDoi && expectedDoi !== actualDoi);

  let score = 0;
  let totalWeight = 0;

  if (reference.title) {
    score += titleScore * 0.60;
    totalWeight += 0.60;

    if (titleScore >= 0.95) {
      reasons.push("Publication title closely matches.");
    } else if (titleScore < 0.50) {
      reasons.push("Publication title differs significantly.");
    }
  }

  if (reference.authors?.length) {
    totalWeight += 0.25;

    if (candidate.authors.length > 0) {
      score += authorsScore * 0.25;

      if (authorsScore > 0) {
        reasons.push("At least one supplied author matches.");
      } else {
        reasons.push("Supplied authors do not match.");
      }
    } else {
      reasons.push("Candidate author metadata is unavailable.");
    }
  }

  if (reference.year !== undefined) {
    totalWeight += 0.15;

    if (candidate.year === undefined) {
      reasons.push("Candidate publication year is unavailable.");
    } else if (!yearConflict) {
      score += 0.15;
      reasons.push("Publication year matches.");
    } else {
      reasons.push("Publication year conflicts.");
    }
  }

  if (totalWeight > 0) {
    score /= totalWeight;
  }

  if (expectedDoi && actualDoi) {
    if (!doiConflict) {
      score = 1;
      reasons.push("DOI matches exactly.");
    } else {
      score = 0;
      reasons.push("DOI conflicts with the supplied DOI.");
    }
  }

  // A year conflict must reduce confidence, even when the title matches.
  if (yearConflict && !doiConflict) {
    score = Math.min(score, 0.49);
  }

  // Never accept a conflicting DOI as a valid publication match.
  if (doiConflict) {
    score = 0;
  }

  // Missing author metadata is not proof of an author mismatch.
  // However, an explicit author mismatch blocks a strong match.
  return {
    candidate,
    score: Math.max(0, Math.min(1, score)),
    reasons,
    titleScore,
    authorsScore,
    yearConflict,
    doiConflict,
  };
}

function safeSourceUrl(url?: string): string | undefined {
  if (!url) return undefined;

  const result = validateExternalUrl(url);

  return result.safe ? result.normalizedUrl : undefined;
}

function unavailableResult(
  reference: Reference,
  limitations: string[]
): ResolvedSource {
  return {
    referenceId: reference.referenceId,
    title: reference.title ?? "",
    authors: [],
    matchStatus: "no_match",
    confidence: 0,
    limitations,
  };
}

function toResolvedSource(
  reference: Reference,
  candidate: SourceCandidate,
  matchStatus: ResolvedSource["matchStatus"],
  confidence: number,
  limitations: string[],
  alternatives?: SourceCandidate[]
): ResolvedSource {
  const sourceUrl = safeSourceUrl(candidate.sourceUrl);
  const landingPageUrl = safeSourceUrl(candidate.landingPageUrl);
  const openAccessUrl = safeSourceUrl(candidate.openAccessUrl);

  return {
    referenceId: reference.referenceId,
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    doi: candidate.doi,
    sourceUrl,
    landingPageUrl,
    publisher: candidate.publisher,
    journal: candidate.journal,
    abstract: candidate.abstract,
    openAccessUrl,
    matchStatus,
    confidence: Math.max(0, Math.min(1, confidence)),
    alternatives,
    limitations,
  };
}

export async function resolveReference(
  reference: Reference
): Promise<ResolvedSource> {
  if (!reference.referenceId?.trim()) {
    return unavailableResult(reference, [
      "The reference is missing its referenceId.",
    ]);
  }

  if (!reference.title?.trim() && !reference.doi?.trim()) {
    return unavailableResult(reference, [
      "The reference contains neither a title nor a DOI.",
    ]);
  }

  // First, try an exact DOI lookup when a DOI is supplied.
  if (reference.doi?.trim()) {
    const doiResult = await searchCrossrefByDoi(reference.doi);

    const candidate = doiResult.candidates[0];

    if (candidate) {
      const scored = scoreCandidate(reference, candidate);

      if (scored.doiConflict) {
        return toResolvedSource(
          reference,
          candidate,
          "no_match",
          0,
          [
            "The returned DOI conflicts with the supplied DOI.",
            ...scored.reasons,
          ]
        );
      }

      const conflictingTitle =
        Boolean(reference.title?.trim()) &&
        scored.titleScore < 0.50;

      if (conflictingTitle || scored.yearConflict) {
        return toResolvedSource(
          reference,
          candidate,
          "ambiguous",
          Math.min(scored.score, 0.49),
          [
            "The DOI lookup returned metadata conflicting with the supplied reference.",
            ...scored.reasons,
          ]
        );
      }

      // An exact DOI is strong identifier evidence, but conflicting
      // bibliographic metadata must not be silently ignored.
      return toResolvedSource(
        reference,
        candidate,
        "exact_doi",
        1,
        [
          "The DOI resolved through Crossref. Check the bibliographic metadata.",
          ...scored.reasons,
          ...doiResult.limitations,
        ]
      );
    }

    if (!reference.title?.trim()) {
      return unavailableResult(reference, [
        "Crossref did not return a usable publication for the supplied DOI.",
        ...doiResult.limitations,
      ]);
    }
  }

  if (!reference.title?.trim()) {
    return unavailableResult(reference, [
      "No title is available for bibliographic search.",
    ]);
  }

  // Search by title and rank the returned candidates.
  const searchResult = await searchCrossrefByTitle(reference.title);

  if (searchResult.candidates.length === 0) {
    return unavailableResult(reference, [
      "Crossref did not return a usable publication match.",
      ...searchResult.limitations,
    ]);
  }

  const ranked = searchResult.candidates
    .map((candidate) => scoreCandidate(reference, candidate))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best) {
    return unavailableResult(reference, [
      "No candidate could be evaluated.",
    ]);
  }

  const secondBest = ranked[1];

  const alternatives = ranked
    .slice(1)
    .filter((item) => item.score >= 0.45)
    .map((item) => item.candidate);

  // A conflicting DOI or publication year must never be treated
  // as a verified match.
  if (best.doiConflict) {
    return toResolvedSource(
      reference,
      best.candidate,
      "no_match",
      0,
      [
        "The candidate DOI conflicts with the supplied DOI.",
        ...best.reasons,
      ],
      alternatives
    );
  }

  if (best.yearConflict) {
    return toResolvedSource(
      reference,
      best.candidate,
      "ambiguous",
      Math.min(best.score, 0.49),
      [
        "The publication year conflicts with the supplied reference.",
        "Verify the publication metadata before accepting this result.",
        ...best.reasons,
      ],
      alternatives
    );
  }

  if (best.score < 0.65) {
    return unavailableResult(reference, [
      "No candidate met the minimum metadata matching threshold.",
      ...best.reasons,
      ...searchResult.limitations,
    ]);
  }

  if (
    secondBest &&
    best.score - secondBest.score < 0.08 &&
    secondBest.score >= 0.65
  ) {
    return toResolvedSource(
      reference,
      best.candidate,
      "ambiguous",
      Math.min(best.score, 0.64),
      [
        "Multiple publications have similarly strong metadata matches.",
        "The top candidate cannot be distinguished confidently.",
        ...best.reasons,
      ],
      alternatives
    );
  }

  if (
    reference.authors?.length &&
    best.candidate.authors.length > 0 &&
    best.authorsScore === 0
  ) {
    return toResolvedSource(
      reference,
      best.candidate,
      "ambiguous",
      Math.min(best.score, 0.49),
      [
        "The title appears similar, but none of the supplied authors match.",
        ...best.reasons,
      ],
      alternatives
    );
  }

  return toResolvedSource(
    reference,
    best.candidate,
    "strong_match",
    best.score,
    [
      "Publication identified using Crossref metadata.",
      ...best.reasons,
      ...searchResult.limitations,
    ],
    alternatives
  );
}