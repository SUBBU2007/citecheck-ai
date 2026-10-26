import type { SourceCandidate } from "./types.ts";

const CROSSREF_API = "https://api.crossref.org";

export interface CrossrefOptions {
  timeoutMs?: number;
}

export interface CrossrefResult {
  candidates: SourceCandidate[];
  status: "success" | "not_found" | "error";
  limitations: string[];
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefDate {
  "date-parts"?: number[][];
}

interface CrossrefLink {
  URL?: string;
  "content-type"?: string;
  "intended-application"?: string;
}

interface CrossrefWork {
  title?: string[];
  author?: CrossrefAuthor[];
  published?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "published-online"?: CrossrefDate;
  DOI?: string;
  URL?: string;
  publisher?: string;
  "container-title"?: string[];
  abstract?: string;
  link?: CrossrefLink[];
}

interface CrossrefResponse {
  status?: string;
  message?: {
    items?: CrossrefWork[];
    [key: string]: unknown;
  };
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getYear(work: CrossrefWork): number | undefined {
  const dates: Array<CrossrefDate | undefined> = [
    work.published,
    work["published-print"],
    work["published-online"],
  ];

  for (const date of dates) {
    const year = date?.["date-parts"]?.[0]?.[0];

    if (
      typeof year === "number" &&
      Number.isInteger(year) &&
      year >= 1000 &&
      year <= 9999
    ) {
      return year;
    }
  }

  return undefined;
}

function normalizeWork(work: CrossrefWork): SourceCandidate | null {
  const title = work.title?.[0]?.trim();

  if (!title) {
    return null;
  }

  const authors = (work.author ?? [])
    .map((author) => {
      if (author.name?.trim()) {
        return author.name.trim();
      }

      return [author.given, author.family]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ")
        .trim();
    })
    .filter((author) => author.length > 0);

  const pdfLink = work.link?.find((link) =>
    link["content-type"]?.toLowerCase().includes("pdf")
  )?.URL;

  const doi = work.DOI?.trim();

  const sourceUrl = doi
    ? `https://doi.org/${encodeURIComponent(doi)}`
    : work.URL;

  return {
    title,
    authors,
    year: getYear(work),
    doi,
    sourceUrl,
    landingPageUrl: work.URL ?? sourceUrl,
    publisher: work.publisher,
    journal: work["container-title"]?.[0],
    abstract: work.abstract ? cleanText(work.abstract) : undefined,
    openAccessUrl: pdfLink,
  };
}

async function requestCrossref(
  path: string,
  timeoutMs: number
): Promise<CrossrefResponse> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${CROSSREF_API}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "CiteCheckAI-SourceRetrieval/1.0 (scholarly citation verification)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Crossref HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Crossref returned an unexpected content type");
    }

    const responseText = await response.text();

    if (responseText.length > 2_000_000) {
      throw new Error("Crossref response exceeded the size limit");
    }

    const data: unknown = JSON.parse(responseText);

    if (
      typeof data !== "object" ||
      data === null ||
      !("message" in data) ||
      typeof data.message !== "object" ||
      data.message === null
    ) {
      throw new Error("Crossref returned malformed JSON");
    }

    return data as CrossrefResponse;
  } finally {
    clearTimeout(timer);
  }
}

function makeResult(
  works: CrossrefWork[],
  limitations: string[] = []
): CrossrefResult {
  const candidates = works
    .map(normalizeWork)
    .filter(
      (candidate): candidate is SourceCandidate => candidate !== null
    );

  return {
    candidates,
    status: candidates.length > 0 ? "success" : "not_found",
    limitations,
  };
}

export async function searchCrossrefByTitle(
  title: string,
  options: CrossrefOptions = {}
): Promise<CrossrefResult> {
  if (!title.trim()) {
    return {
      candidates: [],
      status: "not_found",
      limitations: ["A non-empty title is required."],
    };
  }

  const timeoutMs = options.timeoutMs ?? 8000;

  try {
    const params = new URLSearchParams({
      "query.title": title.trim(),
      rows: "5",
    });

    const data = await requestCrossref(
      `/works?${params.toString()}`,
      timeoutMs
    );

    const items = data.message?.items;

    if (!Array.isArray(items)) {
      return {
        candidates: [],
        status: "error",
        limitations: ["Crossref returned no valid items array."],
      };
    }

    return makeResult(items);
  } catch (error) {
    return {
      candidates: [],
      status: "error",
      limitations: [
        error instanceof Error
          ? error.name === "AbortError"
            ? "Crossref request timed out."
            : error.message
          : "Unknown Crossref request failure.",
      ],
    };
  }
}

function normalizeDoi(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

export async function searchCrossrefByDoi(
  doi: string,
  options: CrossrefOptions = {}
): Promise<CrossrefResult> {
  const normalizedDoi = normalizeDoi(doi);

  const validDoi =
    /^10\.\d{4,9}\/\S+$/i.test(normalizedDoi) &&
    !/[\u0000-\u0020\u007f]/.test(normalizedDoi);

  if (!validDoi) {
    return {
      candidates: [],
      status: "not_found",
      limitations: ["The supplied DOI has an invalid format."],
    };
  }

  const timeoutMs = options.timeoutMs ?? 8000;

  try {
    const data = await requestCrossref(
      `/works/${encodeURIComponent(normalizedDoi)}`,
      timeoutMs
    );

    const work = data.message as CrossrefWork | undefined;

    if (
      !work ||
      typeof work !== "object" ||
      !Array.isArray(work.title) ||
      work.title.length === 0
    ) {
      return {
        candidates: [],
        status: "not_found",
        limitations: [
          "Crossref returned no usable publication metadata.",
        ],
      };
    }

    return makeResult([work]);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Crossref failure";

    const timedOut =
      error instanceof Error && error.name === "AbortError";

    return {
      candidates: [],
      status: "error",
      limitations: [
        message.includes("HTTP 404")
          ? "Crossref has no record for this DOI."
          : timedOut
            ? "Crossref DOI lookup timed out."
            : message,
      ],
    };
  }
}
