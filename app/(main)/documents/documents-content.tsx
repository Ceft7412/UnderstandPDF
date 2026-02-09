"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
  ArrowRight,
} from "lucide-react";
import { listDocuments, deleteDocument } from "@/src/services/documents";
import type { Document } from "@/src/services/documents";
import { useAuth } from "@/src/shared/hooks";

// ---------- Helpers ----------

function statusConfig(status: Document["status"]) {
  switch (status) {
    case "ready":
      return {
        label: "Ready",
        icon: CheckCircle2,
        color: "text-green-600",
        bg: "bg-green-50",
        border: "border-green-200",
      };
    case "processing":
      return {
        label: "Processing",
        icon: Loader2,
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-200",
        animate: true,
      };
    case "uploading":
      return {
        label: "Uploading",
        icon: Upload,
        color: "text-amber-600",
        bg: "bg-amber-50",
        border: "border-amber-200",
      };
    case "failed":
      return {
        label: "Failed",
        icon: AlertCircle,
        color: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-200",
      };
    default:
      return {
        label: status,
        icon: FileText,
        color: "text-gray-600",
        bg: "bg-gray-50",
        border: "border-gray-200",
      };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// ---------- Component ----------

export default function DocumentsContent() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load documents
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const docs = await listDocuments();
        setDocuments(docs);
      } catch (err) {
        console.error("Failed to load documents:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, authLoading]);

  // Handle delete
  async function handleDelete(docId: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;

    setDeletingId(docId);
    try {
      const success = await deleteDocument(docId);
      if (success) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setDeletingId(null);
    }
  }

  // Not logged in
  if (!authLoading && !user) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h1 className="text-lg font-semibold text-gray-900">
            Sign in to view your documents
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Upload and analyze PDFs after signing in.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  // Loading
  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            {documents.length}{" "}
            {documents.length === 1 ? "document" : "documents"} uploaded
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Upload className="h-4 w-4" />
          Upload PDF
        </Link>
      </div>

      {/* Empty state */}
      {documents.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">
            No documents yet
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Upload your first PDF to get started with research insights.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            Upload a PDF
          </Link>
        </div>
      ) : (
        /* Document list */
        <div className="space-y-3">
          {documents.map((doc) => {
            const config = statusConfig(doc.status);
            const StatusIcon = config.icon;
            const isDeleting = deletingId === doc.id;
            const isClickable = doc.status === "ready";

            return (
              <div
                key={doc.id}
                className={`group flex items-center gap-4 rounded-lg border p-4 transition-all ${
                  isClickable
                    ? "cursor-pointer border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    : "border-gray-200"
                }`}
                onClick={() => {
                  if (isClickable) {
                    router.push(
                      `/chat?id=${doc.id}&file=${encodeURIComponent(doc.file_name)}`
                    );
                  }
                }}
              >
                {/* File icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-gray-900">
                    {doc.file_name}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>{formatFileSize(doc.file_size)}</span>
                    {doc.total_pages && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>
                          {doc.total_pages}{" "}
                          {doc.total_pages === 1 ? "page" : "pages"}
                        </span>
                      </>
                    )}
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(doc.created_at)}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bg} ${config.border} ${config.color}`}
                >
                  <StatusIcon
                    className={`h-3 w-3 ${
                      "animate" in config && config.animate
                        ? "animate-spin"
                        : ""
                    }`}
                  />
                  {config.label}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {isClickable && (
                    <ArrowRight className="h-4 w-4 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                    disabled={isDeleting}
                    className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Delete document"
                    title="Delete document"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
