import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "../lib/sources/urlSafety.js";

describe("External URL validation", () => {
  it("accepts an allowed HTTPS scholarly source", () => {
    const result = validateExternalUrl("https://api.crossref.org/works");
    expect(result.safe).toBe(true);
    expect(result.normalizedUrl).toBeDefined();
  });

  it("rejects a JavaScript URL", () => {
    const result = validateExternalUrl("javascript:alert(1)");
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("rejects a malformed URL", () => {
    const result = validateExternalUrl("not-a-valid-url");
    expect(result.safe).toBe(false);
    expect(result.reason).toBe("Malformed URL.");
  });

  it("rejects a hostname outside the scholarly-source allowlist", () => {
    const result = validateExternalUrl("https://example.com");
    expect(result.safe).toBe(false);
  });

  it("rejects localhost URLs", () => {
    const result = validateExternalUrl("http://localhost:3000");
    expect(result.safe).toBe(false);
  });

  it("rejects URLs containing credentials", () => {
    const result = validateExternalUrl(
      "https://user:password@api.crossref.org/works",
    );
    expect(result.safe).toBe(false);
  });

  it("rejects non-standard ports", () => {
    const result = validateExternalUrl("https://api.crossref.org:8080/works");
    expect(result.safe).toBe(false);
  });

  it("removes URL fragments from accepted URLs", () => {
    const result = validateExternalUrl(
      "https://api.crossref.org/works#section",
    );

    expect(result.safe).toBe(true);
    expect(result.normalizedUrl).toBe("https://api.crossref.org/works");
  });
});
