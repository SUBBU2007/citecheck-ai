
import type { ClaimReport } from "@/types";

export interface VerificationResponse {
  reports: ClaimReport[];
  warnings: string[];
}

export type VerificationInput =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "file";
      file: File;
    };

export async function verifyDocument(
  input: VerificationInput
): Promise<VerificationResponse> {
  let body: BodyInit;
  const headers: HeadersInit = {};

  if (input.kind === "text") {
    body = JSON.stringify({ text: input.text });
    headers["Content-Type"] = "application/json";
  } else {
    const formData = new FormData();
    formData.append("file", input.file);
    body = formData;
  }

  const response = await fetch("/api/verify", {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      message || `Verification failed with status ${response.status}`
    );
  }

  return (await response.json()) as VerificationResponse;
}