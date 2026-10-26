"use client";

import { useState } from "react";
import type { ClaimReport, Verdict } from "@/types";



const verdictStyles: Record<Verdict, string> = {
  supported: "border-emerald-200 bg-emerald-50 text-emerald-800",
  weakly_supported: "border-amber-200 bg-amber-50 text-amber-800",
  mismatched: "border-rose-200 bg-rose-50 text-rose-800",
  unverifiable: "border-slate-200 bg-slate-100 text-slate-700",
};

const verdictLabels: Record<Verdict, string> = {
  supported: "Supported",
  weakly_supported: "Weakly supported",
  mismatched: "Mismatched",
  unverifiable: "Unverifiable",
};

function formatVerdict(verdict: Verdict) {
  return verdictLabels[verdict];
}

interface ResultsDashboardProps {
  reports: ClaimReport[];
}

export default function ResultsDashboard({
  reports,
}: ResultsDashboardProps) {
  const [selectedFilter, setSelectedFilter] = useState<"all" | Verdict>("all");
  const [expandedClaims, setExpandedClaims] = useState<string[]>(["claim-1"]);

  const filteredReports = reports.filter(
    (report) =>
      selectedFilter === "all" ||
      report.verification.verdict === selectedFilter,
  );

  const toggleClaim = (claimId: string) => {
    setExpandedClaims((current) =>
      current.includes(claimId)
        ? current.filter((id) => id !== claimId)
        : [...current, claimId],
    );
  };

  const countVerdicts = (verdict: Verdict) =>
    reports.filter((report) => report.verification.verdict === verdict)
      .length;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            Verification report
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Claim-by-claim results
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Inspect each claim, its cited source, and the supporting evidence.
          </p>
        </div>

        
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Claims analyzed" value={reports.length} />
        <SummaryCard label="Supported" value={countVerdicts("supported")} />
        <SummaryCard
          label="Weakly supported"
          value={countVerdicts("weakly_supported")}
        />
        <SummaryCard
          label="Needs review"
          value={countVerdicts("mismatched") + countVerdicts("unverifiable")}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold text-slate-900">Extracted claims</h3>
            <p className="mt-1 text-sm text-slate-500">
              Select a verdict to filter the report.
            </p>
          </div>

          <select
            value={selectedFilter}
            onChange={(event) =>
              setSelectedFilter(event.target.value as "all" | Verdict)
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            aria-label="Filter claims by verdict"
          >
            <option value="all">All verdicts</option>
            <option value="supported">Supported</option>
            <option value="weakly_supported">Weakly supported</option>
            <option value="mismatched">Mismatched</option>
            <option value="unverifiable">Unverifiable</option>
          </select>
        </div>

        <div className="mt-5 space-y-4">
          {filteredReports.map((report) => {
            const { claim, references, sources, verification } = report;
            const isExpanded = expandedClaims.includes(claim.id);

            return (
              <article
                key={claim.id}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() => toggleClaim(claim.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-slate-50 sm:p-5"
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {claim.id.replace("-", " ")}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdictStyles[verification.verdict]}`}
                    >
                      {formatVerdict(verification.verdict)}
                    </span>
                  </div>

                  <p className="w-full text-sm font-medium leading-6 text-slate-900 sm:text-base">
                    {claim.text}
                  </p>

                  <div className="flex w-full items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Citations: {claim.citationIds.length}</span>
                    <span>
                      {isExpanded ? "Hide details −" : "View details +"}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-5 border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Explanation
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {verification.explanation}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Cited references
                      </h4>
                      <div className="mt-2 space-y-2">
                        {references.length > 0 ? (
                          references.map((reference) => (
                            <div
                              key={reference.id}
                              className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <p className="text-sm font-medium text-slate-800">
                                {reference.title || reference.rawText}
                              </p>
                              <p className="mt-1 break-words text-xs text-slate-500">
                                {reference.rawText}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">
                            No reference was associated with this claim.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Source evidence
                      </h4>
                      <div className="mt-2 space-y-3">
                        {sources.map((source) => (
                          <div
                            key={source.referenceId}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <p className="text-sm font-medium text-slate-800">
                              {source.title || source.referenceId}
                            </p>

                            {source.sourceUrl && (
                              <a
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block break-all text-xs text-emerald-700 underline underline-offset-2"
                              >
                                Open source
                              </a>
                            )}

                            {source.evidenceText.length > 0 ? (
                              source.evidenceText.map((excerpt, index) => (
                                <blockquote
                                  key={`${source.referenceId}-${index}`}
                                  className="mt-3 border-l-2 border-emerald-500 pl-3 text-sm leading-6 text-slate-600"
                                >
                                  {excerpt}
                                </blockquote>
                              ))
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">
                                No source excerpt is available.
                              </p>
                            )}

                            <p className="mt-3 text-xs text-slate-500">
                              Retrieval: {source.retrievalStatus}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {verification.evidence.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          Evidence linked to this verdict
                        </h4>
                        {verification.evidence.map((evidence, index) => (
                          <blockquote
                            key={`${evidence.referenceId}-${index}`}
                            className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600"
                          >
                            <span className="mb-1 block text-xs font-semibold text-slate-500">
                              Reference: {evidence.referenceId}
                            </span>
                            {evidence.excerpt}
                          </blockquote>
                        ))}
                      </div>
                    )}

                    {verification.limitations.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <h4 className="text-sm font-semibold text-amber-900">
                          Limitations
                        </h4>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                          {verification.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {filteredReports.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No claims match this filter.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium leading-5 text-slate-500 sm:text-sm">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
