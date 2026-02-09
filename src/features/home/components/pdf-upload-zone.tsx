"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2 } from "lucide-react";
import { useRequireAuth, useAuth } from "@/src/shared/hooks";
import { uploadDocument, getUploadCredits } from "@/src/services/documents";
import type { UploadCreditsInfo } from "@/src/services/documents";

export function PdfUploadZone() {
  const router = useRouter();
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<UploadCreditsInfo | null>(null);

  // Fetch credits when user is authenticated
  useEffect(() => {
    if (!user) {
      setCredits(null);
      return;
    }
    getUploadCredits().then(setCredits).catch(() => setCredits(null));
  }, [user]);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return;
      }

      // 50 MB file size limit
      const MAX_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setError("File is too large. Maximum size is 50 MB.");
        return;
      }

      if (!(await requireAuth())) return;

      // Client-side credit check (server also enforces this)
      if (credits && !credits.canUpload) {
        setError("You've used all 5 free uploads. Upgrade to continue.");
        return;
      }

      setError(null);
      setUploadedFile(file.name);
      setIsUploading(true);

      try {
        // Upload to Supabase Storage via server action
        console.log("[PdfUploadZone] Starting upload for:", file.name, "size:", file.size);
        const formData = new FormData();
        formData.append("file", file);

        const result = await uploadDocument(formData);
        console.log("[PdfUploadZone] uploadDocument result:", JSON.stringify(result));

        if (result.error || !result.document) {
          console.error("[PdfUploadZone] Upload error:", result.error);
          setError(result.error ?? "Upload failed.");
          setUploadedFile(null);
          setIsUploading(false);
          return;
        }

        // Update local credits after successful upload
        if (credits && !credits.hasActiveSubscription) {
          setCredits({
            ...credits,
            remainingCredits: credits.remainingCredits - 1,
            canUpload: credits.remainingCredits - 1 > 0,
          });
        }

        // Navigate to processing page with the document ID
        console.log("[PdfUploadZone] Upload success, navigating to /processing with id:", result.document.id);
        router.push(
          `/processing?id=${result.document.id}&file=${encodeURIComponent(file.name)}`
        );
      } catch (err) {
        console.error("[PdfUploadZone] Unexpected error:", err);
        setError("Upload failed. Please try again.");
        setUploadedFile(null);
        setIsUploading(false);
      }
    },
    [router, requireAuth, credits]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const isOutOfCredits = credits && !credits.canUpload;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-gray-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Upload your PDF
        </h2>
        {credits && !credits.hasActiveSubscription && (
          <span
            className={`text-xs font-medium ${
              credits.remainingCredits <= 1
                ? "text-amber-600"
                : "text-gray-400"
            }`}
          >
            {credits.remainingCredits} / 5 uploads left
          </span>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Error message */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isUploading && !isOutOfCredits && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isUploading && !isOutOfCredits) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDrop={isOutOfCredits ? undefined : onDrop}
        onDragOver={isOutOfCredits ? undefined : onDragOver}
        onDragLeave={isOutOfCredits ? undefined : onDragLeave}
        className={`flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${
          isOutOfCredits
            ? "cursor-not-allowed border-gray-200 bg-gray-50"
            : isUploading
              ? "cursor-wait border-blue-400 bg-blue-50/60"
              : isDragging
                ? "cursor-pointer border-blue-500 bg-blue-50/60"
                : uploadedFile
                  ? "cursor-pointer border-green-400 bg-green-50/60"
                  : "cursor-pointer border-gray-300 bg-green-50/60 hover:border-gray-400"
        }`}
      >
        {isOutOfCredits ? (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Upload className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              Free uploads used
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Upgrade your plan to continue uploading
            </p>
          </>
        ) : isUploading ? (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">{uploadedFile}</p>
            <p className="mt-1 text-xs text-gray-500">Uploading...</p>
          </>
        ) : uploadedFile ? (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">{uploadedFile}</p>
            <p className="mt-1 text-xs text-gray-500">Redirecting...</p>
          </>
        ) : (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Upload className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-sm text-gray-600">Drag and drop PDF here</p>
            <span className="mt-1 text-sm font-medium text-blue-600">
              or click to browse
            </span>
          </>
        )}
      </div>
    </div>
  );
}
