import { isIP } from "node:net";

export interface UrlValidationResult {
  safe: boolean;
  normalizedUrl?: string;
  reason?: string;
}

const ALLOWED_HOSTS = new Set([
  "api.crossref.org",
  "api.semanticscholar.org",
  "doi.org",
  "dx.doi.org",
  "europepmc.org",
  "www.ebi.ac.uk",
  "pmc.ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "openalex.org",
  "api.openalex.org",
]);

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) || part < 0 || part > 255
    )
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPrivateIPv6(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (value === "::" || value === "::1") {
    return true;
  }

  // Reject IPv4-mapped IPv6 addresses unless separately normalized.
  if (value.startsWith("::ffff:")) {
    return true;
  }

  // Unique-local, link-local, and IPv6 documentation ranges.
  if (
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("2001:db8:")
  ) {
    return true;
  }

  return false;
}

export function validateExternalUrl(
  input: string
): UrlValidationResult {
  let parsed: URL;

  try {
    parsed = new URL(input);
  } catch {
    return {
      safe: false,
      reason: "Malformed URL.",
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      safe: false,
      reason: "Only HTTP and HTTPS URLs are allowed.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      safe: false,
      reason: "URLs containing credentials are not allowed.",
    };
  }

  if (parsed.port && !["80", "443"].includes(parsed.port)) {
    return {
      safe: false,
      reason: "Non-standard ports are not allowed.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid")
  ) {
    return {
      safe: false,
      reason: "Local or reserved hostnames are not allowed.",
    };
  }

  const ipVersion = isIP(hostname);

  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    return {
      safe: false,
      reason: "Private or reserved IPv4 addresses are not allowed.",
    };
  }

  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    return {
      safe: false,
      reason: "Private or reserved IPv6 addresses are not allowed.",
    };
  }

  if (ipVersion !== 0) {
    return {
      safe: false,
      reason: "Direct IP-address URLs are not allowed.",
    };
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    return {
      safe: false,
      reason: "The hostname is not in the scholarly-source allowlist.",
    };
  }

  parsed.hash = "";

  return {
    safe: true,
    normalizedUrl: parsed.toString(),
  };
}