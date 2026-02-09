"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Configure the PDF.js worker via CDN (matches the bundled pdfjs-dist version)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ---------- Types ----------

export type ScrollMode = "single" | "continuous";

export interface PdfViewerProps {
  /** PDF source — URL string, Blob/File, ArrayBuffer, or {url}/{data} object */
  file: string | Blob | ArrayBuffer | { url: string } | { data: Uint8Array } | null;
  /** Currently displayed page (1-indexed). In continuous mode used for scrollTo. */
  pageNumber: number;
  /** Zoom / scale factor applied to the PDF's intrinsic size (default 1.0) */
  scale?: number;
  /** "single" renders one page at a time; "continuous" renders all pages vertically */
  scrollMode?: ScrollMode;
  /** Callback fired when the document loads successfully */
  onLoadSuccess?: (totalPages: number) => void;
  /** Callback fired when loading fails */
  onLoadError?: (error: Error) => void;
  /** Called when the most-visible page changes (continuous mode only) */
  onPageChange?: (page: number) => void;
  /** Whether to show the text selection layer */
  renderTextLayer?: boolean;
  /** Whether to show the annotation layer (react-pdf built-in links etc.) */
  renderAnnotationLayer?: boolean;
  /** Extra class name for the outer wrapper */
  className?: string;
  /** Page number to highlight with a ring */
  highlightedPage?: number | null;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotate?: number;
}

// ---------- Component ----------

export default function PdfViewer({
  file,
  pageNumber,
  scale = 1.0,
  scrollMode = "single",
  onLoadSuccess,
  onLoadError,
  onPageChange,
  renderTextLayer = true,
  renderAnnotationLayer = true,
  className,
  highlightedPage = null,
  rotate = 0,
}: PdfViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);

  // Refs for page elements (continuous mode) — keyed by page number
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Track whether we're programmatically scrolling (to avoid observer feedback)
  const isScrollingTo = useRef(false);

  const handleLoadSuccess = useCallback(
    (pdf: { numPages: number }) => {
      setIsLoading(false);
      setError(null);
      setNumPages(pdf.numPages);
      onLoadSuccess?.(pdf.numPages);
    },
    [onLoadSuccess],
  );

  const handleLoadError = useCallback(
    (err: Error) => {
      setIsLoading(false);
      setError(err.message);
      onLoadError?.(err);
    },
    [onLoadError],
  );

  // In continuous mode, scroll to the requested page when pageNumber changes
  useEffect(() => {
    if (scrollMode !== "continuous" || numPages === 0) return;

    const el = pageRefs.current.get(pageNumber);
    if (el) {
      isScrollingTo.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Reset flag after scroll animation
      setTimeout(() => {
        isScrollingTo.current = false;
      }, 600);
    }
  }, [pageNumber, scrollMode, numPages]);

  // IntersectionObserver to track which page is most visible (continuous mode)
  useEffect(() => {
    if (scrollMode !== "continuous" || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingTo.current) return;

        let bestPage = pageNumber;
        let bestRatio = 0;

        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio > bestRatio
          ) {
            const page = Number(entry.target.getAttribute("data-page"));
            if (page) {
              bestRatio = entry.intersectionRatio;
              bestPage = page;
            }
          }
        }

        if (bestRatio > 0) {
          onPageChange?.(bestPage);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [scrollMode, numPages, onPageChange, pageNumber]);

  // Register a page ref
  const setPageRef = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(page, el);
    } else {
      pageRefs.current.delete(page);
    }
  }, []);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No PDF loaded
      </div>
    );
  }

  const pageLoading = (
    <div className="flex h-[600px] w-[450px] items-center justify-center bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
    </div>
  );

  return (
    <div className={className ?? ""}>
      {/* Error state */}
      {error && !isLoading && (
        <div className="flex w-full items-center justify-center px-6 py-12">
          <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-center">
            <p className="text-sm font-medium text-red-800">
              Failed to load PDF
            </p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      <Document
        file={file}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={
          <div className="flex h-[600px] w-[450px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              <p className="text-xs text-gray-400">Loading PDF...</p>
            </div>
          </div>
        }
      >
        {scrollMode === "single" ? (
          /* ---------- Single-page mode ---------- */
          <div
            className={`relative inline-block transition-all duration-300 ${
              highlightedPage === pageNumber
                ? "ring-2 ring-amber-400 ring-offset-2"
                : ""
            }`}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              rotate={rotate}
              renderTextLayer={renderTextLayer}
              renderAnnotationLayer={renderAnnotationLayer}
              loading={pageLoading}
            />
          </div>
        ) : (
          /* ---------- Continuous-scroll mode ---------- */
          <div className="flex flex-col items-center gap-8">
            {Array.from({ length: numPages }, (_, i) => {
              const page = i + 1;
              return (
                <div
                  key={page}
                  ref={(el) => setPageRef(page, el)}
                  data-page={page}
                  className={`relative inline-block rounded-sm bg-white shadow-lg transition-all duration-300 ${
                    highlightedPage === page
                      ? "ring-2 ring-amber-400 ring-offset-2"
                      : ""
                  }`}
                >
                  <Page
                    pageNumber={page}
                    scale={scale}
                    rotate={rotate}
                    renderTextLayer={renderTextLayer}
                    renderAnnotationLayer={renderAnnotationLayer}
                    loading={pageLoading}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Document>
    </div>
  );
}
