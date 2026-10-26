"use client";

import { useRef, useState } from "react";
import Link from "next/link";
//import ResultsDashboard from "@/app/components/ResultsDashboard";
import ResultsDashboard from "@/app/components/ResultDashboard";

import { verifyDocument } from "@/lib/api";
import type { ClaimReport } from "@/types";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentText, setDocumentText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [reports, setReports] = useState<ClaimReport[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const acceptedFileTypes = [".pdf", ".txt", ".docx"];
  const maxFileSize = 10 * 1024 * 1024;

  function handleFile(file: File | undefined) {
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!acceptedFileTypes.includes(extension)) {
      setMessage("Please select a PDF, TXT, or DOCX file.");
      return;
    }

    if (file.size > maxFileSize) {
      setMessage("Your file exceeds the 10 MB limit.");
      return;
    }

    setSelectedFile(file);
    setMessage("");
  }

  async function handleSubmit() {
    if (!selectedFile && !documentText.trim()) {
      setMessage("Upload a document or paste research text to continue.");
      return;
    }

    setMessage("");
    setIsLoading(true);

    try {
      const response = await verifyDocument(
        selectedFile
          ? { kind: "file", file: selectedFile }
          : { kind: "text", text: documentText },
      );

      setReports(response.reports);
      setWarnings(response.warnings);
      setShowResults(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Verification failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function clearInput() {
    setSelectedFile(null);
    setDocumentText("");
    setMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleBackToDocument() {
    setShowResults(false);
  }

  if (showResults) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto mb-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link className="brand" href="/" aria-label="CiteCheck AI home">
            <span className="brand-mark">C</span>
            <span>
              CiteCheck<span className="brand-accent"> AI</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={handleBackToDocument}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            ← Back to document
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="mx-auto mb-6 w-full max-w-6xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Warnings</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <ResultsDashboard reports={reports} />
      </main>
    );
  }

  return (
    <main className="site-shell">
      <nav className="navbar">
        <Link className="brand" href="/" aria-label="CiteCheck AI home">
          <span className="brand-mark">C</span>
          <span>
            CiteCheck<span className="brand-accent"> AI</span>
          </span>
        </Link>

        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#checker">Checker</a>
          <span className="nav-status">
            <span className="status-dot" />
            Research integrity tool
          </span>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-icon">✳</span>
            AI-POWERED CITATION VERIFICATION
          </div>

          <h1>
            Does your evidence
            <br />
            <span>actually support</span>
            <br />
            your claims?
          </h1>

          <p className="hero-description">
            Verify research citations against their actual sources. Find
            unsupported claims, conflicting evidence, and references that need a
            closer look.
          </p>

          <div className="hero-points">
            <span>
              <span className="check-icon">✓</span>
              Evidence-linked results
            </span>
            <span>
              <span className="check-icon">✓</span>
              Transparent limitations
            </span>
            <span>
              <span className="check-icon">✓</span>
              Four clear verdicts
            </span>
          </div>
        </div>

        <div
          className="hero-visual"
          aria-label="Illustration of citation verification"
        >
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />

          <div className="visual-card document-card">
            <div className="mini-window-bar">
              <span />
              <span />
              <span />
              <small>research-paper.pdf</small>
            </div>

            <div className="document-content">
              <span className="document-label">CLAIM DETECTED</span>
              <div className="document-line long" />
              <div className="document-line medium" />
              <div className="document-line short" />
              <div className="citation-highlight">[1, 2]</div>
              <div className="document-divider" />
              <div className="document-line long" />
              <div className="document-line medium" />
            </div>
          </div>

          <div className="verification-chip">
            <span className="chip-check">✓</span>
            <span>
              <strong>Evidence linked</strong>
              <small>Source traceable</small>
            </span>
          </div>

          <div className="visual-card result-card">
            <span className="result-overline">VERIFICATION RESULT</span>
            <div className="result-status">
              <span className="result-dot" />
              Evidence reviewed
            </div>
            <div className="result-line" />
            <div className="result-line result-line-short" />
            <div className="result-footer">
              <span>Claim</span>
              <span>Source</span>
              <span>Evidence</span>
            </div>
          </div>

          <div className="visual-sparkle sparkle-one">✳</div>
          <div className="visual-sparkle sparkle-two">✦</div>
        </div>
      </section>

      <section className="checker-section" id="checker">
        <div className="section-heading">
          <div>
            <span className="section-kicker">START CHECKING</span>
            <h2>Put your citations to the test.</h2>
            <p>Upload a research document or paste its text to get started.</p>
          </div>
          <div className="file-limit">PDF · TXT · DOCX · Up to 10 MB</div>
        </div>

        <div className="checker-card">
          <div className="input-tabs">
            <span className="active-tab">
              <span>↥</span> Upload document
            </span>
            <span className="tab-divider">or</span>
            <span className="paste-tab">Paste text below</span>
          </div>

          <button
            className={`upload-zone ${selectedFile ? "has-file" : ""}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx"
              className="visually-hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />

            <span className="upload-icon">{selectedFile ? "✓" : "↑"}</span>

            {selectedFile ? (
              <>
                <strong>{selectedFile.name}</strong>
                <span>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Selected
                  successfully
                </span>
              </>
            ) : (
              <>
                <strong>Drop your document here or browse files</strong>
                <span>PDF, TXT or DOCX · Maximum file size 10 MB</span>
              </>
            )}
          </button>

          <div className="input-separator">
            <span />
            <small>OR PASTE RESEARCH TEXT</small>
            <span />
          </div>

          <label className="textarea-label" htmlFor="research-text">
            Document text
          </label>

          <textarea
            id="research-text"
            className="research-textarea"
            placeholder={`Paste an excerpt from your research paper here...\n\nExample: Our proposed model achieved 95% accuracy on the CIFAR-10 dataset [1].`}
            value={documentText}
            onChange={(event) => {
              setDocumentText(event.target.value);
              setMessage("");
            }}
            rows={6}
          />

          <div className="input-footer">
            <span>{documentText.length.toLocaleString()} characters</span>
            <button className="clear-button" type="button" onClick={clearInput}>
              Clear input
            </button>
          </div>

          {message && (
            <p className="input-message" role="status">
              {message}
            </p>
          )}

          <div className="submit-row">
            <p>
              <span className="privacy-icon">▣</span>
              Evidence-based results, with limitations made explicit.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? "Verifying citations..." : "Verify citations"}
            </button>
          </div>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading">
          <span className="section-kicker">HOW IT WORKS</span>
          <h2>From citation to evidence.</h2>
          <p>
            Every result should be traceable to the source that supports it.
          </p>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01</span>
            <div className="step-icon">⌕</div>
            <h3>Extract claims</h3>
            <p>
              Identify research claims and link them to the citations provided
              in the document.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">02</span>
            <div className="step-icon">↗</div>
            <h3>Retrieve sources</h3>
            <p>
              Find cited papers and collect accessible source evidence with
              traceable references.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">03</span>
            <div className="step-icon">◎</div>
            <h3>Verify evidence</h3>
            <p>
              Compare each claim with the retrieved passages and explain what
              the evidence does and does not establish.
            </p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark">C</span>
          <span>
            CiteCheck<span className="brand-accent"> AI</span>
          </span>
        </Link>
        <span>Research claims deserve verifiable evidence.</span>
        <span>Built for research integrity.</span>
      </footer>
    </main>
  );
}
