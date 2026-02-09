"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { processDocument } from "@/src/services/rag";
import { getDocument } from "@/src/services/documents";

const STEPS = [
  "Uploading document...",
  "Extracting text from PDF...",
  "Splitting into chunks...",
  "Generating embeddings...",
  "Indexing for search...",
  "Almost ready...",
];

export default function ProcessingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get("id");
  const fileName = searchParams.get("file") ?? "document.pdf";

  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<
    "processing" | "ready" | "failed"
  >("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track whether we've already kicked off processing
  const processingStarted = useRef(false);

  useEffect(() => {
    if (!documentId) {
      setStatus("failed");
      setErrorMessage("No document ID provided.");
      return;
    }

    if (processingStarted.current) return;
    processingStarted.current = true;

    console.log("[ProcessingContent] Starting processing for document:", documentId);

    // Animate progress steps while processing happens in the background
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        // Don't advance past "Almost ready..." until actually ready
        if (prev < STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 2000);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        // Cap at 90% until processing actually finishes
        if (prev >= 90) return 90;
        return prev + 1;
      });
    }, 200);

    // Kick off the actual processing pipeline
    async function runProcessing() {
      try {
        console.log("[ProcessingContent] Calling processDocument...");
        const result = await processDocument(documentId!);
        console.log("[ProcessingContent] processDocument result:", JSON.stringify(result));

        if (!result.success) {
          console.error("[ProcessingContent] Processing failed:", result.error);
          setStatus("failed");
          setErrorMessage(result.error);
          clearInterval(stepInterval);
          clearInterval(progressInterval);
          return;
        }

        // Processing succeeded — finish the animation
        console.log("[ProcessingContent] Processing succeeded, redirecting...");
        setProgress(100);
        setCurrentStep(STEPS.length - 1);
        setStatus("ready");

        // Brief delay so user sees "100%" before redirect
        setTimeout(() => {
          router.push(
            `/chat?id=${documentId}&file=${encodeURIComponent(fileName)}`
          );
        }, 800);
      } catch (err) {
        console.error("[ProcessingContent] Unexpected error:", err);
        setStatus("failed");
        setErrorMessage("An unexpected error occurred during processing.");
        clearInterval(stepInterval);
        clearInterval(progressInterval);
      }
    }

    runProcessing();

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [documentId, fileName, router]);

  // If no document ID, show error
  if (!documentId) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="text-lg font-semibold text-gray-900">
            Missing document
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            No document ID was provided. Please upload a PDF first.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to Upload
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        {/* Top section */}
        <div className="text-center">
          {/* File icon */}
          <div
            className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${
              status === "failed" ? "bg-red-50" : "bg-blue-50"
            }`}
          >
            {status === "failed" ? (
              <XCircle className="h-8 w-8 text-red-500" />
            ) : status === "ready" ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <FileText className="h-8 w-8 text-blue-600" />
            )}
          </div>

          {/* Title */}
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            {status === "failed"
              ? "Processing failed"
              : status === "ready"
                ? "Document ready!"
                : "Processing your document"}
          </h1>
          <p className="mb-8 text-sm text-gray-500">{fileName}</p>

          {/* Error message */}
          {status === "failed" && errorMessage && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          {/* Progress bar */}
          {status !== "failed" && (
            <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  status === "ready" ? "bg-green-500" : "bg-blue-600"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Current step */}
          {status === "processing" && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>{STEPS[currentStep]}</span>
            </div>
          )}

          {/* Step indicators */}
          {status !== "failed" && (
            <div className="mt-6 space-y-2">
              {STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`flex items-center gap-2 text-xs transition-opacity duration-300 ${
                    i <= currentStep
                      ? "text-gray-700 opacity-100"
                      : "text-gray-400 opacity-40"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      i < currentStep
                        ? "bg-green-500"
                        : i === currentStep
                          ? "bg-blue-600"
                          : "bg-gray-300"
                    }`}
                  />
                  {step}
                </div>
              ))}
            </div>
          )}

          {/* Retry / Go back buttons for failed state */}
          {status === "failed" && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Upload a different PDF
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
