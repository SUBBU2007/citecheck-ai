import { NextResponse } from "next/server";
import { extractDocument } from "@/lib/document/extractDocuments";
import { resolveReference } from "@/lib/sources/resolveReferences";
import { retrieveEvidence } from "@/lib/sources/retrieveEvidence";
import { verifyClaim } from "@/lib/verification/verify-claims";
import type {
  ClaimReport,
  Reference as AppReference,
  SourceEvidence as AppSourceEvidence,
} from "@/types";

// export const runtime = "nodejs";
// export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    let input:
      | { type: "text"; text: string }
      | { type: "pdf"; data: Uint8Array; filename: string };

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'Please upload a file using the "file" field.' },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size must not exceed 10 MB." },
          { status: 413 }
        );
      }

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
          { error: "PDF uploads are supported for now. You can paste text from other documents." },
          { status: 415 }
        );
      }

      input = {
        type: "pdf",
        data: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
      };
    } else {
      const body = await request.json();
      if (typeof body.text !== "string" || !body.text.trim()) {
        return NextResponse.json(
          { error: "Please provide document text to verify." },
          { status: 400 }
        );
      }

      input = { type: "text", text: body.text };
    }

    const document = await extractDocument(input);
    const warnings = document.warnings.map((warning) => warning.message);

    if (document.claims.length === 0) {
      return NextResponse.json({
        reports: [],
        warnings: [
          ...warnings,
          "No citation-bearing claims were extracted. Try a document with numbered citations such as [1] or [2].",
        ],
      });
    }

    // Keep the demo responsive and limit external requests.
    const claims = document.claims.slice(0, 30);
    if (document.claims.length > claims.length) {
      warnings.push("Only the first 30 extracted claims were processed.");
    }

    const referencesById = new Map(
      document.references.map((reference) => [reference.id, reference])
    );

    // Resolve each bibliography entry once, preserving its original ID.
    const usedReferenceIds = [
      ...new Set(claims.flatMap((claim) => claim.citationIds)),
    ];

    const resolvedSources = await Promise.all(
      usedReferenceIds.map(async (referenceId) => {
        const reference = referencesById.get(referenceId);

        if (!reference) return null;

        try {
          return await resolveReference({
            referenceId: reference.id,
            title: reference.title,
            doi: reference.doi,
            url: reference.urls[0],
          });
        } catch {
          warnings.push(
            `Could not resolve reference [${referenceId}] because a source lookup failed.`
          );
          return null;
        }
      })
    );

    const resolvedById = new Map(
      resolvedSources
        .filter((source) => source !== null)
        .map((source) => [source.referenceId, source])
    );

    const reports: ClaimReport[] = await Promise.all(
      claims.map(async (claim) => {
        const citedReferences = claim.citationIds
          .map((id) => referencesById.get(id))
          .filter((reference) => reference !== undefined);

        const retrieved = await Promise.all(
          claim.citationIds.map(async (referenceId) => {
            const source = resolvedById.get(referenceId);

            if (!source) {
              return {
                referenceId,
                title: referencesById.get(referenceId)?.title,
                sourceUrl: undefined,
                evidenceLevel: "none" as const,
                evidenceText: [],
                retrievalStatus: "unavailable" as const,
                limitations: [
                  "The cited reference could not be resolved to a reliable source.",
                ],
              };
            }

            try {
              return await retrieveEvidence(source, {
                claimId: claim.id,
                text: claim.text,
              });
            } catch {
              return {
                referenceId,
                title: source.title,
                sourceUrl: source.sourceUrl,
                evidenceLevel: "none" as const,
                evidenceText: [],
                retrievalStatus: "unavailable" as const,
                limitations: ["Evidence retrieval failed."],
              };
            }
          })
        );

        // Adapt Member 3's richer evidence format to Member 4's contract.
        
        // Convert Member 3's EvidenceExcerpt objects into Member 4's string-based contract.
        const verificationEvidence: AppSourceEvidence[] = retrieved.map(
          (source) => ({
            referenceId: source.referenceId,
            title: source.title,
            sourceUrl: source.sourceUrl,
            evidenceText: source.evidenceText.map((passage) => passage.text),
            retrievalStatus: source.retrievalStatus,
            limitations: source.limitations,
          })
        );


        const verification = await verifyClaim(
          {
            id: claim.id,
            text: claim.text,
            citationIds: claim.citationIds,
          },
          verificationEvidence
        );

        const appReferences: AppReference[] = citedReferences.map(
          (reference) => ({
            id: reference.id,
            rawText: reference.raw,
            title: reference.title,
            doi: reference.doi,
            url: reference.urls[0],
          })
        );

        return {
          claim: {
            id: claim.id,
            text: claim.text,
            citationIds: claim.citationIds,
          },
          references: appReferences,
          sources: verificationEvidence,
          verification,
        };
      })
    );

    return NextResponse.json({ reports, warnings });
  } catch (error) {
    console.error("CiteCheck verification request failed:", error);

    return NextResponse.json(
      { error: "Verification failed. Please check the document and try again." },
      { status: 500 }
    );
  }
}
