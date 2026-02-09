"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  Compass,
  Rows3,
  File,
  Loader2,
  FlaskConical,
  ArrowRightLeft,
  Shuffle,
  Network,
  RefreshCw,
  FolderOpen,
  Search,
  X,
  FileSearch,
  Download,
  Printer,
  RotateCw,
  Maximize2,
  PanelRight,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ScrollMode } from "@/src/components/pdf-viewer";
import { getDocumentDownloadUrl } from "@/src/services/documents";

const PdfViewer = dynamic(() => import("@/src/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  ),
});
import {
  getCachedDocumentInsights,
  getInsightPlan,
  extractGroupInsights,
  mergeAndCacheInsights,
  regenerateInsights,
} from "@/src/services/insights";
import { searchChunks } from "@/src/services/rag";
import type {
  Insight,
  LocalSource,
  ResearchDirection,
} from "@/src/services/insights";

// ---------- Helpers ----------

/** Semantic search result from the RAG pipeline */
interface ChunkResult {
  id: string;
  chunk_index: number;
  content: string;
  page_start: number;
  page_end: number;
  token_count: number;
  similarity: number;
}

/** Keyframe animation for cards appearing */
const cardAppearKeyframes = `
@keyframes insightCardAppear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

/** Map research direction category to icon and color */
function directionStyle(category: string) {
  switch (category) {
    case "Adjacent Field":
      return {
        icon: Compass,
        bg: "bg-teal-50",
        border: "border-teal-100",
        text: "text-teal-700",
        badge: "bg-teal-100 text-teal-700",
      };
    case "Alternative Approach":
      return {
        icon: FlaskConical,
        bg: "bg-amber-50",
        border: "border-amber-100",
        text: "text-amber-700",
        badge: "bg-amber-100 text-amber-700",
      };
    case "Contrasting Theory":
      return {
        icon: ArrowRightLeft,
        bg: "bg-rose-50",
        border: "border-rose-100",
        text: "text-rose-700",
        badge: "bg-rose-100 text-rose-700",
      };
    case "Cross-Discipline":
      return {
        icon: Network,
        bg: "bg-purple-50",
        border: "border-purple-100",
        text: "text-purple-700",
        badge: "bg-purple-100 text-purple-700",
      };
    default:
      return {
        icon: Shuffle,
        bg: "bg-gray-50",
        border: "border-gray-100",
        text: "text-gray-700",
        badge: "bg-gray-100 text-gray-700",
      };
  }
}

// ---------- Component ----------

export default function PdfContent() {
  const searchParams = useSearchParams();
  const documentId = searchParams.get("id");
  const fileName = searchParams.get("file") ?? "document.pdf";

  // PDF viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [scrollMode, setScrollMode] = useState<ScrollMode>("single");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);

  // Insight cards state
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  // Progressive loading state
  const [loadingProgress, setLoadingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const abortRef = useRef(false);

  // Toolbar state
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [pageInputValue, setPageInputValue] = useState("");
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [chunkResults, setChunkResults] = useState<ChunkResult[]>([]);
  const [chunkSearching, setChunkSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load PDF signed URL from Supabase Storage
  useEffect(() => {
    if (!documentId) {
      setPdfLoading(false);
      return;
    }

    async function loadPdf() {
      try {
        const url = await getDocumentDownloadUrl(documentId!);
        if (url) {
          setPdfUrl(url);
        }
      } catch (err) {
        console.error("Failed to load PDF:", err);
      } finally {
        setPdfLoading(false);
      }
    }

    loadPdf();
  }, [documentId]);

  // Progressive insight loading
  const loadInsights = useCallback(async () => {
    if (!documentId) {
      setInsightsLoading(false);
      return;
    }

    abortRef.current = false;
    setInsightsLoading(true);
    setInsightsError(false);
    setInsights([]);
    setLoadingProgress(null);
    setIsMerging(false);

    try {
      // 1. Check cache first
      const cached = await getCachedDocumentInsights(documentId);
      if (cached && cached.length > 0) {
        setInsights(cached);
        setInsightsLoading(false);
        return;
      }

      // 2. Get the extraction plan
      const plan = await getInsightPlan(documentId);
      if (!plan) {
        setInsights([]);
        setInsightsLoading(false);
        return;
      }

      setLoadingProgress({ current: 0, total: plan.totalGroups });

      // 3. Extract groups sequentially, appending cards as they arrive
      const allGroupInsights: Insight[] = [];

      for (let i = 0; i < plan.totalGroups; i++) {
        if (abortRef.current) return;

        setLoadingProgress({ current: i + 1, total: plan.totalGroups });

        const groupInsights = await extractGroupInsights(
          documentId,
          i,
          plan.totalGroups
        );

        allGroupInsights.push(...groupInsights);
        if (abortRef.current) return;
        // Append incrementally so cards appear as they're extracted
        // Deduplicate by ID to guard against Strict Mode double-invocation
        setInsights((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = groupInsights.filter((g) => !existingIds.has(g.id));
          return [...prev, ...newItems];
        });
      }

      if (abortRef.current) return;

      // 4. All groups done — initial loading complete
      setInsightsLoading(false);
      setLoadingProgress(null);

      // 5. Merge & cache in background (only if there are insights to merge)
      if (allGroupInsights.length > 0) {
        setIsMerging(true);
        try {
          const merged = await mergeAndCacheInsights(
            documentId,
            allGroupInsights
          );
          if (!abortRef.current) {
            setInsights(merged);
          }
        } catch (mergeErr) {
          console.error("[insights] Merge failed, keeping unmerged:", mergeErr);
          // Keep the unmerged insights — they're still useful
        } finally {
          if (!abortRef.current) {
            setIsMerging(false);
          }
        }
      }
    } catch (err) {
      console.error("Failed to generate insights:", err);
      if (!abortRef.current) {
        setInsightsError(true);
        setInsightsLoading(false);
        setLoadingProgress(null);
      }
    }
  }, [documentId]);

  useEffect(() => {
    loadInsights();
    return () => {
      abortRef.current = true;
    };
  }, [loadInsights]);

  // Navigate to a specific page in the PDF viewer
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    setHighlightedPage(page);
    setTimeout(() => setHighlightedPage(null), 2000);
  }, []);

  // Client-side insight filtering
  const filteredInsights = searchQuery.trim()
    ? insights.filter((card) => {
        const q = searchQuery.toLowerCase();
        return (
          card.title.toLowerCase().includes(q) ||
          card.description.toLowerCase().includes(q)
        );
      })
    : insights;

  // Semantic search via RAG pipeline
  const runSemanticSearch = useCallback(async () => {
    if (!documentId || !searchQuery.trim()) return;

    setChunkSearching(true);
    setHasSearched(true);
    try {
      const results = await searchChunks(documentId, searchQuery.trim(), 6);
      setChunkResults(results);
    } catch (err) {
      console.error("Semantic search failed:", err);
      setChunkResults([]);
    } finally {
      setChunkSearching(false);
    }
  }, [documentId, searchQuery]);

  // Download handler — fetch the signed URL as a blob and trigger a browser download
  const handleDownload = useCallback(async () => {
    if (!pdfUrl) return;
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [pdfUrl, fileName]);

  // Print handler — open the PDF in a hidden iframe and trigger print
  const handlePrint = useCallback(() => {
    if (!pdfUrl) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-10000px";
    iframe.style.left = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.src = pdfUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // Cross-origin fallback: open in a new tab
        window.open(pdfUrl, "_blank");
      }
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
    document.body.appendChild(iframe);
  }, [pdfUrl]);

  // Rotate handler — cycle through 0 → 90 → 180 → 270 → 0
  const handleRotate = useCallback(() => {
    setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  }, []);

  // Fit to width — measure the viewer container and calculate the right scale
  const handleFitToWidth = useCallback(() => {
    const container = viewerContainerRef.current;
    if (!container) return;
    // Approximate a standard PDF page width (612pt ≈ 816px at 96dpi).
    // If rotated 90/270, we use the height (792pt ≈ 1056px) instead.
    const pdfPageWidth = rotation === 90 || rotation === 270 ? 792 : 612;
    const containerWidth = container.clientWidth - 64; // subtract padding (p-8 = 32*2)
    const newScale = Math.round((containerWidth / pdfPageWidth) * 100) / 100;
    setScale(Math.max(0.5, Math.min(3.0, newScale)));
  }, [rotation]);

  // Go-to-page handler
  const commitPageInput = useCallback(() => {
    const page = parseInt(pageInputValue, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page);
    }
    setPageInputValue("");
  }, [pageInputValue, totalPages, goToPage]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setChunkResults([]);
    setHasSearched(false);
    searchInputRef.current?.focus();
  }, []);

  // No document ID — error state
  if (!documentId) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h1 className="text-lg font-semibold text-gray-900">No document</h1>
          <p className="mt-2 text-sm text-gray-500">
            Please upload a PDF first.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link
              href="/documents"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              My Documents
            </Link>
            <Link
              href="/"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Upload a PDF
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 overflow-hidden">
      {/* Inject keyframes for card animations */}
      <style dangerouslySetInnerHTML={{ __html: cardAppearKeyframes }} />
      {/* ==================== PDF Viewer ==================== */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-100">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-3 py-1.5">
          {/* Filename */}
          <div className="flex items-center gap-2 mr-1">
            <FileText className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="max-w-[160px] truncate text-xs font-medium text-gray-700">
              {fileName}
            </span>
          </div>

          <div className="mx-1.5 h-4 w-px bg-gray-200" />

          {/* Page navigation — grouped in a subtle container */}
          <div className="flex items-center gap-0.5 rounded-md bg-gray-50 border border-gray-100 px-1 py-0.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded p-1 text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm disabled:opacity-25"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[52px] text-center text-xs text-gray-600 tabular-nums select-none">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded p-1 text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm disabled:opacity-25"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitPageInput(); }}
              onBlur={commitPageInput}
              placeholder="Go"
              className="w-9 rounded border border-gray-200 bg-white px-1 py-0.5 text-center text-[11px] text-gray-600 outline-none focus:border-blue-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-label="Go to page"
              title="Go to page"
            />
          </div>

          <div className="mx-1.5 h-4 w-px bg-gray-200" />

          {/* View controls: scroll mode + zoom + rotate */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setScrollMode((m) => (m === "single" ? "continuous" : "single"))}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label={scrollMode === "single" ? "Switch to continuous scroll" : "Switch to single page"}
              title={scrollMode === "single" ? "Continuous scroll" : "Single page"}
            >
              {scrollMode === "single" ? <Rows3 className="h-3.5 w-3.5" /> : <File className="h-3.5 w-3.5" />}
            </button>

            <div className="mx-1 h-3.5 w-px bg-gray-200" />

            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setScale((s) => Math.min(3.0, s + 0.25))}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleFitToWidth}
              className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Fit to width"
            >
              {Math.round(scale * 100)}%
            </button>

            <div className="mx-1 h-3.5 w-px bg-gray-200" />

            <button
              onClick={handleRotate}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Rotate clockwise"
              title="Rotate 90°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side: download, print, sidebar toggle */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleDownload}
              disabled={!pdfUrl}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
              aria-label="Download PDF"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handlePrint}
              disabled={!pdfUrl}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
              aria-label="Print PDF"
              title="Print"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
            <div className="mx-0.5 h-3.5 w-px bg-gray-200" />
            <button
              onClick={() => setSidebarHidden((h) => !h)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
              title={sidebarHidden ? "Show sidebar" : "Expand viewer"}
            >
              {sidebarHidden ? <PanelRight className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* PDF page area */}
        <div ref={viewerContainerRef} className="min-h-0 flex-1 overflow-auto p-8 text-center">
          {pdfLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : pdfUrl ? (
            <PdfViewer
              file={pdfUrl}
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              scrollMode={scrollMode}
              highlightedPage={highlightedPage}
              onLoadSuccess={(numPages) => setTotalPages(numPages)}
              onPageChange={(page) => setCurrentPage(page)}
              className={
                scrollMode === "single"
                  ? "inline-block rounded-sm bg-white text-left shadow-lg"
                  : "inline-block text-left"
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500">Failed to load PDF</p>
            </div>
          )}
        </div>
      </div>

      {/* ==================== RIGHT PANE: Insights Sidebar ==================== */}
      {!sidebarHidden && (
      <div className="flex w-[420px] shrink-0 flex-col border-l border-gray-200 bg-white">
        {/* Sidebar header */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            Research Assistant
          </h2>
          {!insightsError && insights.length > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 tabular-nums">
              {insights.length}
            </span>
          )}
          {isMerging && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              Refining...
            </span>
          )}
          <Link
            href="/documents"
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
            title="My Documents"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Search bar */}
        <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runSemanticSearch();
                }
              }}
              placeholder="Filter insights or search document..."
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-8 text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-300"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <p className="mt-1.5 text-[10px] text-gray-400">
              Press <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to search full document
            </p>
          )}
        </div>

        {/* Cards list */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {/* Semantic search results */}
          {(chunkSearching || (hasSearched && chunkResults.length >= 0)) && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <FileSearch className="h-3.5 w-3.5 text-indigo-500" />
                Document Search
                {!chunkSearching && hasSearched && (
                  <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 tabular-nums">
                    {chunkResults.length}
                  </span>
                )}
              </p>

              {chunkSearching ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-3">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
                  <p className="text-xs text-indigo-600">
                    Searching document...
                  </p>
                </div>
              ) : hasSearched && chunkResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-center">
                  <p className="text-xs text-gray-400">
                    No matching passages found.
                  </p>
                </div>
              ) : (
                chunkResults.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2.5"
                    style={{
                      animation:
                        "insightCardAppear 0.3s ease-out backwards",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => goToPage(chunk.page_start)}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Pages {chunk.page_start}
                        {chunk.page_end !== chunk.page_start &&
                          `–${chunk.page_end}`}
                      </button>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500 tabular-nums">
                        {Math.round(chunk.similarity * 100)}% match
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-gray-600">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}

              {/* Divider between semantic results and insights */}
              {insights.length > 0 && hasSearched && (
                <div className="flex items-center gap-2 pb-1 pt-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[10px] font-medium text-gray-400">
                    {searchQuery.trim() ? "Matching insights" : "All insights"}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
              )}
            </div>
          )}
          {/* Full-page loading: only shown when no insights have arrived yet */}
          {insightsLoading && insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="mb-3 h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm text-gray-500">
                {loadingProgress
                  ? `Analyzing section ${loadingProgress.current} of ${loadingProgress.total}...`
                  : "Analyzing document..."}
              </p>
            </div>
          ) : insightsError ? (
            <div className="py-12 text-center">
              <Lightbulb className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                Failed to generate insights
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Something went wrong. Please try again.
              </p>
              <button
                onClick={loadInsights}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : insights.length === 0 && !hasSearched ? (
            <div className="py-12 text-center">
              <Lightbulb className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">
                No insights could be generated for this document.
              </p>
            </div>
          ) : filteredInsights.length === 0 && searchQuery.trim() ? (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">
                No insights match &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            </div>
          ) : (
            filteredInsights.map((card, cardIndex) => {
              const isExpanded = activeCardId === card.id;
              const localSources = card.sources.filter(
                (s): s is LocalSource => s.type === "local"
              );

              return (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setActiveCardId(isExpanded ? null : card.id)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveCardId(isExpanded ? null : card.id);
                    }
                  }}
                  className={`w-full cursor-pointer rounded-lg border p-4 text-left transition-all ${
                    isExpanded
                      ? "border-blue-300 bg-blue-50/50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                  }`}
                  style={{
                    animation: `insightCardAppear 0.3s ease-out ${(cardIndex % 5) * 75}ms backwards`,
                  }}
                >
                  {/* Card title */}
                  <h3 className="text-sm font-semibold text-gray-900">
                    {card.title}
                  </h3>

                  {/* Card description */}
                  <p
                    className={`mt-1.5 text-xs leading-relaxed text-gray-600 ${
                      isExpanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {card.description}
                  </p>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {/* Document Sources */}
                      {localSources.length > 0 && (
                        <div className="space-y-2">
                          <p className="flex items-center gap-1 text-xs font-medium text-gray-400">
                            <BookOpen className="h-3 w-3" />
                            Document Sources
                          </p>
                          {localSources.map((src, i) => (
                            <div
                              key={`local-${i}`}
                              className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  goToPage(src.page);
                                }}
                                className="text-xs font-medium text-blue-600 hover:underline"
                              >
                                Page {src.page} &mdash; {src.section}
                              </button>
                              <p className="mt-0.5 text-xs italic text-gray-500">
                                &ldquo;{src.quote}&rdquo;
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Research Directions */}
                      {card.researchDirections.length > 0 && (
                        <div className="space-y-2">
                          <p className="flex items-center gap-1 text-xs font-medium text-gray-400">
                            <Compass className="h-3 w-3" />
                            Research Directions
                          </p>
                          {card.researchDirections.map((rd, i) => {
                            const style = directionStyle(rd.category);
                            const Icon = style.icon;
                            return (
                              <div
                                key={`rd-${i}`}
                                className={`rounded-md border ${style.border} ${style.bg} px-3 py-2`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <Icon className={`h-3 w-3 ${style.text}`} />
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}
                                  >
                                    {rd.category}
                                  </span>
                                </div>
                                <p
                                  className={`mt-1 text-xs font-medium ${style.text}`}
                                >
                                  {rd.title}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-600">
                                  {rd.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsed hint */}
                  {!isExpanded && (
                    <p className="mt-2 text-xs text-gray-400">
                      {localSources.length > 0 &&
                        `${localSources.length} ${localSources.length === 1 ? "source" : "sources"}`}
                      {localSources.length > 0 &&
                        card.researchDirections.length > 0 &&
                        " · "}
                      {card.researchDirections.length > 0 &&
                        `${card.researchDirections.length} research ${card.researchDirections.length === 1 ? "direction" : "directions"}`}
                    </p>
                   )}
                </div>
              );
            })
          )}

          {/* Bottom progress indicator: shown when cards exist but more groups are loading */}
          {insights.length > 0 && insightsLoading && loadingProgress && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
              <p className="text-xs text-blue-600">
                Analyzing section {loadingProgress.current} of{" "}
                {loadingProgress.total}...
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </main>
  );
}
