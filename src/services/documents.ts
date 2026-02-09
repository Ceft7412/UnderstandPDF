"use server";

import { createClient } from "@/lib/supabase/server";

// ---------- Types ----------

export interface Document {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  total_pages: number | null;
  status: "uploading" | "processing" | "ready" | "failed";
}

interface UploadResult {
  document: Document;
  error: null;
}

interface UploadError {
  document: null;
  error: string;
}

// ---------- Server Actions ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkActiveSubscription(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (error || !data) return false;
  return data.length > 0;
}

/**
 * Upload a PDF to Supabase Storage and create a document record.
 *
 * Flow:
 * 1. Verify the user is authenticated
 * 2. Insert a document row with status "uploading"
 * 3. Upload the file to Supabase Storage at `{user_id}/{document_id}/{filename}`
 * 4. Update the document row with the storage path and status "processing"
 *
 * Returns the document record (with status "processing") or an error string.
 */
export async function uploadDocument(
  formData: FormData
): Promise<UploadResult | UploadError> {
  console.log("[uploadDocument] Starting upload...");
  const supabase = await createClient();

  // 1. Verify authentication
  console.log("[uploadDocument] Checking auth...");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("[uploadDocument] Auth failed:", authError?.message);
    return { document: null, error: "You must be signed in to upload a PDF." };
  }
  console.log("[uploadDocument] Auth OK, user:", user.id);

  // 2. Check upload credits (free users have a limited number of uploads)
  const hasActiveSubscription = await checkActiveSubscription(supabase, user.id);
  console.log("[uploadDocument] Active subscription:", hasActiveSubscription);

  if (!hasActiveSubscription) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("pdf_upload_credits")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[uploadDocument] Profile fetch failed:", profileError?.message);
      return { document: null, error: "Could not verify upload credits." };
    }

    console.log("[uploadDocument] Remaining credits:", profile.pdf_upload_credits);

    if (profile.pdf_upload_credits <= 0) {
      return {
        document: null,
        error: "You've used all 5 free uploads. Upgrade to continue.",
      };
    }
  }

  // 3. Extract file from FormData  
  const file = formData.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    console.error("[uploadDocument] Invalid file:", file?.type);
    return { document: null, error: "Please provide a valid PDF file." };
  }
  console.log("[uploadDocument] File:", file.name, "Size:", file.size);

  // 4. Create document row with status "uploading"
  console.log("[uploadDocument] Inserting document row...");
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      file_name: file.name,
      file_url: "", // placeholder — updated after storage upload
      file_size: file.size,
      status: "uploading",
    })
    .select()
    .single();

  if (insertError || !doc) {
    console.error("[uploadDocument] Insert failed:", insertError?.message);
    return {
      document: null,
      error: insertError?.message ?? "Failed to create document record.",
    };
  }
  console.log("[uploadDocument] Document row created:", doc.id);

  // 5. Upload to Supabase Storage: pdfs/{user_id}/{document_id}/{filename}
  const storagePath = `${user.id}/${doc.id}/${file.name}`;
  console.log("[uploadDocument] Uploading to storage:", storagePath);
  const fileBuffer = await file.arrayBuffer();
  console.log("[uploadDocument] ArrayBuffer ready, size:", fileBuffer.byteLength);

  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(storagePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadDocument] Storage upload failed:", uploadError.message);
    // Clean up the document row since upload failed
    await supabase.from("documents").delete().eq("id", doc.id);
    return {
      document: null,
      error: `Storage upload failed: ${uploadError.message}`,
    };
  }
  console.log("[uploadDocument] Storage upload OK");

  // 6. Decrement upload credits for free users
  if (!hasActiveSubscription) {
    const { error: creditError } = await supabase.rpc("decrement_upload_credit", {
      user_id: user.id,
    });
    if (creditError) {
      console.error("[uploadDocument] Credit decrement failed:", creditError.message);
      // Non-blocking — the upload already succeeded, don't fail the whole operation
    } else {
      console.log("[uploadDocument] Upload credit decremented");
    }
  }

  // 7. Update document with file_url and set status to "processing"
  console.log("[uploadDocument] Updating document status to processing...");
  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({
      file_url: storagePath,
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id)
    .select()
    .single();

  if (updateError || !updated) {
    console.error("[uploadDocument] Update failed:", updateError?.message);
    return {
      document: null,
      error: updateError?.message ?? "Failed to update document status.",
    };
  }

  console.log("[uploadDocument] Upload complete, document:", updated.id);
  return { document: updated as Document, error: null };
}

/**
 * Get a document by ID. Returns null if not found or not owned by user.
 */
export async function getDocument(
  documentId: string
): Promise<Document | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error || !data) return null;
  return data as Document;
}

/**
 * Get a signed download URL for a document's PDF (valid for 1 hour).
 */
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<string | null> {
  const supabase = await createClient();

  // First get the document to find the storage path
  const { data: doc, error } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", documentId)
    .single();

  if (error || !doc?.file_url) return null;

  const { data: signed, error: signError } = await supabase.storage
    .from("pdfs")
    .createSignedUrl(doc.file_url, 3600); // 1 hour

  if (signError || !signed?.signedUrl) return null;
  return signed.signedUrl;
}

/**
 * Update a document's status.
 */
export async function updateDocumentStatus(
  documentId: string,
  status: Document["status"],
  extraFields?: { total_pages?: number }
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("documents")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extraFields,
    })
    .eq("id", documentId);

  return !error;
}

/**
 * List all documents for the current authenticated user,
 * ordered by most recently created first.
 */
export async function listDocuments(): Promise<Document[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Document[];
}

/**
 * Delete a document, its storage file, associated chunks, and cached insights.
 *
 * Because document_chunks and document_insights have ON DELETE CASCADE,
 * deleting the document row automatically removes related rows. We just
 * need to manually delete the Storage object.
 *
 * Returns true on success, false on failure.
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const supabase = await createClient();

  // 1. Fetch the document to get the storage path and verify ownership
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", documentId)
    .single();

  if (fetchError || !doc) return false;

  // 2. Delete the file from Supabase Storage
  if (doc.file_url) {
    await supabase.storage.from("pdfs").remove([doc.file_url]);
  }

  // 3. Delete the document row (cascades to chunks + insights)
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  return !deleteError;
}

// ---------- Upload Credits ----------

export interface UploadCreditsInfo {
  remainingCredits: number;
  hasActiveSubscription: boolean;
  /** true if user can upload (has credits or subscription) */
  canUpload: boolean;
}

/**
 * Get the current user's upload credit status.
 * Returns remaining credits, subscription status, and whether they can upload.
 */
export async function getUploadCredits(): Promise<UploadCreditsInfo | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const hasSub = await checkActiveSubscription(supabase, user.id);

  if (hasSub) {
    return { remainingCredits: -1, hasActiveSubscription: true, canUpload: true };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("pdf_upload_credits")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return {
    remainingCredits: profile.pdf_upload_credits,
    hasActiveSubscription: false,
    canUpload: profile.pdf_upload_credits > 0,
  };
}
