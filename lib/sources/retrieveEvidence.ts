import type {
  ExtractedClaim,
  ResolvedSource,
  SourceEvidence,
} from "./types.js";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_LENGTH = 2_000_000;
const MAX_EXCERPTS = 5;

interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
  url: string;
}

function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    if (url.username || url.password) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    if (
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchSource(url: string): Promise<FetchResult> {
  const failed: FetchResult = {
    ok: false,
    status: 0,
    text: "",
    contentType: "",
    url,
  };

  if (!isSafePublicUrl(url)) {
    return failed;
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/html, text/plain",
        "User-Agent": "CiteCheckAI/1.0",
      },
    });

    if (!response.ok) {
      return {
        ...failed,
        status: response.status,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      !contentType.includes("json") &&
      !contentType.includes("html") &&
      !contentType.startsWith("text/")
    ) {
      return {
        ...failed,
        status: response.status,
        contentType,
      };
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? 0
    );

    if (declaredLength > MAX_RESPONSE_LENGTH) {
      return {
        ...failed,
        status: response.status,
        contentType,
      };
    }

    const text = await response.text();

    if (text.length > MAX_RESPONSE_LENGTH) {
      return {
        ...failed,
        status: response.status,
        contentType,
      };
    }

    return {
      ok: true,
      status: response.status,
      text,
      contentType,
      url,
    };
  } catch {
    return failed;
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getPassages(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((passage) => passage.trim())
    .filter((passage) => passage.length >= 40)
    .map((passage) => passage.slice(0, 1200));
}

function findRelevantExcerpts(
  text: string,
  claim: string
): string[] {
  const words = claim.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  const uniqueWords = [...new Set(words)].filter(
    (word) => word.length > 2
  );

  if (uniqueWords.length === 0) {
    return [];
  }

  return getPassages(text)
    .map((passage, index) => {
      const lowerPassage = passage.toLowerCase();

      const matches = uniqueWords.filter((word) =>
        lowerPassage.includes(word)
      ).length;

      return {
        passage,
        index,
        score: matches / uniqueWords.length,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_EXCERPTS)
    .map((item) => item.passage);
}

function makeUnavailable(
  referenceId: string,
  title: string,
  sourceUrl: string,
  limitations: string[]
): SourceEvidence {
  return {
    referenceId,
    title,
    sourceUrl,
    evidenceLevel: "none",
    evidenceText: [],
    retrievalStatus: "unavailable",
    limitations,
    };
}

export async function retrieveEvidence(
  source: ResolvedSource,
  claim: ExtractedClaim
): Promise<SourceEvidence> {
  const sourceData = source as unknown as Record<string, unknown>;
  const claimData = claim as unknown as Record<string, unknown>;

  const referenceId =
    typeof sourceData.referenceId === "string"
      ? sourceData.referenceId
      : "";

  const title =
    typeof sourceData.title === "string"
      ? sourceData.title
      : "";

  const sourceUrl =
    typeof sourceData.sourceUrl === "string"
      ? sourceData.sourceUrl
      : "";

  const doi =
    typeof sourceData.doi === "string"
      ? sourceData.doi
      : "";

  const claimText =
    typeof claimData.text === "string"
      ? claimData.text
      : typeof claimData.claimText === "string"
        ? claimData.claimText
        : "";

  if (!referenceId) {
    return makeUnavailable("", title, sourceUrl, [
      "The original reference ID is missing.",
    ]);
  }

  if (!claimText.trim()) {
    return makeUnavailable(referenceId, title, sourceUrl, [
      "The extracted claim is empty or uses an unsupported field name.",
    ]);
  }

  const matchStatus = sourceData.matchStatus;

  if (
    matchStatus === "no_match" ||
    matchStatus === "ambiguous"
  ) {
    return makeUnavailable(referenceId, title, sourceUrl, [
      "The publication identity is uncertain. Resolve the reference before retrieving evidence.",
    ]);
  }

  const limitations: string[] = [];
  const urls: string[] = [];

  if (sourceUrl) {
    urls.push(sourceUrl);
  }

  if (doi) {
    urls.push(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    );
  }

  for (const url of [...new Set(urls)]) {
    const result = await fetchSource(url);

    if (!result.ok) {
      if (result.status === 429) {
        limitations.push("The source API rate limit was reached.");
      } else if (result.status === 0) {
        limitations.push(
          "The source could not be retrieved because of a network, timeout, or URL validation failure."
        );
      } else {
        limitations.push(
          `The source returned HTTP ${result.status}.`
        );
      }

      continue;
    }

    let retrievedText = "";
    let evidenceLevel = "source page";

    if (url.includes("api.crossref.org/works/")) {
      try {
        const data: unknown = JSON.parse(result.text);

        if (
          typeof data === "object" &&
          data !== null &&
          "message" in data
        ) {
          const message = data.message;

          if (
            typeof message === "object" &&
            message !== null &&
            "abstract" in message &&
            typeof message.abstract === "string"
          ) {
            retrievedText = cleanText(message.abstract);
            evidenceLevel = "Crossref abstract";
          }
        }
      } catch {
        limitations.push("The Crossref response was malformed.");
        continue;
      }
    } else {
      retrievedText = cleanText(result.text);
    }

    if (!retrievedText) {
      limitations.push(
        "The retrieved source did not contain usable text."
      );
      continue;
    }

    const excerpts = findRelevantExcerpts(
      retrievedText,
      claimText
    );

    if (excerpts.length === 0) {
      limitations.push(
        "No relevant passages were identified in the retrieved text."
      );
      continue;
    }

    return {
        referenceId,
        title,
        sourceUrl: url,
        evidenceLevel:
            evidenceLevel === "Crossref abstract"
            ? "abstract"
            : "full_text",
        evidenceText: excerpts.map((excerpt) => ({
        text: excerpt,
        section: evidenceLevel === "Crossref abstract" ? "abstract" : "source",
        sourceUrl: url,
        evidenceLevel:
            evidenceLevel === "Crossref abstract" ? "abstract" : "full_text",
        })),
        retrievalStatus:
            evidenceLevel === "Crossref abstract"
            ? "partial"
            : "available",
        limitations: [
        `Evidence was extracted from the ${evidenceLevel}.`,
        "Passages are selected using keyword overlap; relevance does not establish that the claim is supported.",
        ...(evidenceLevel === "Crossref abstract"
          ? [
              "Abstract-only evidence cannot establish details that require full-text methods, tables, or figures.",
            ]
          : [
              "Retrieved page text may include navigation or unrelated material. Confirm the publication identity and passage context.",
            ]),
        ...limitations,
      ],
    };
  }

  return makeUnavailable(
    referenceId,
    title,
    sourceUrl,
    [
      "No relevant, accessible evidence passages could be retrieved.",
      "An unavailable source must not automatically be classified as mismatched.",
      ...limitations,
    ]
  );
}