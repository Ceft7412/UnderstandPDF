"use server";

import { createClient } from "@/lib/supabase/server";
import { PDFParse } from "pdf-parse";
import { updateDocumentStatus } from "./documents";

// ---------- Config ----------

const CHUNK_SIZE = 800; // target tokens per chunk (roughly 1 token ≈ 4 chars)
const CHUNK_OVERLAP = 100; // overlap in tokens for context continuity
const EMBEDDING_MODEL = "gemini-embedding-001"; // Gemini: 3072 native, truncated to 768
const EMBEDDING_DIMS = 768; // outputDimensionality — matches DB vector(768)
const EMBEDDING_BATCH_SIZE = 20; // max chunks per embedding API call
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ---------- Types ----------

interface TextChunk {
  content: string;
  page_start: number;
  page_end: number;
  token_count: number;
}

interface PageText {
  page: number;
  text: string;
}

// ---------- Internal helpers ----------

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }
  return apiKey;
}

/**
 * Rough token count estimate. ~4 chars per token for English text.
 * Good enough for chunking; exact counts aren't critical.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract text from a PDF buffer using pdf-parse v2's class-based API.
 * Returns per-page text and total page count.
 */
async function extractTextFromPdf(
  buffer: Buffer
): Promise<{ pages: PageText[]; totalPages: number }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const textResult = await parser.getText({
      pageJoiner: "", // we handle page joining ourselves
    });

    const pages: PageText[] = textResult.pages.map((p) => ({
      page: p.num,
      text: p.text,
    }));

    return { pages, totalPages: textResult.total };
  } finally {
    await parser.destroy();
  }
}

/**
 * Split page-level text into overlapping chunks of roughly CHUNK_SIZE tokens.
 * Chunks respect sentence boundaries where possible and track which pages
 * they span.
 */
function chunkText(pages: PageText[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  // Build a single stream of sentences with page annotations
  const sentences: { text: string; page: number }[] = [];
  for (const { page, text } of pages) {
    // Split on sentence boundaries (period/question/exclamation followed by space or newline)
    const parts = text.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        sentences.push({ text: trimmed, page });
      }
    }
  }

  if (sentences.length === 0) return [];

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkPageStart = sentences[0]!.page;
  let chunkPageEnd = sentences[0]!.page;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence.text);

    // If adding this sentence would exceed the chunk size, finalize the current chunk
    if (currentTokens + sentenceTokens > CHUNK_SIZE && currentChunk.length > 0) {
      const content = currentChunk.join(" ");
      chunks.push({
        content,
        page_start: chunkPageStart,
        page_end: chunkPageEnd,
        token_count: estimateTokens(content),
      });

      // Build overlap: take the last few sentences that fit within CHUNK_OVERLAP tokens
      let overlapTokens = 0;
      let overlapStart = currentChunk.length;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const t = estimateTokens(currentChunk[i]!);
        if (overlapTokens + t > CHUNK_OVERLAP) break;
        overlapTokens += t;
        overlapStart = i;
      }

      currentChunk = currentChunk.slice(overlapStart);
      currentTokens = overlapTokens;
      chunkPageStart = sentence.page; // approximate — overlap may span back
    }

    currentChunk.push(sentence.text);
    currentTokens += sentenceTokens;
    chunkPageEnd = sentence.page;
  }

  // Finalize last chunk
  if (currentChunk.length > 0) {
    const content = currentChunk.join(" ");
    chunks.push({
      content,
      page_start: chunkPageStart,
      page_end: chunkPageEnd,
      token_count: estimateTokens(content),
    });
  }

  return chunks;
}

/**
 * Generate embeddings for an array of text chunks using Gemini's
 * batchEmbedContents REST API with gemini-embedding-001.
 * Uses outputDimensionality to truncate to 768 dims (HNSW limit is 2000).
 * Returns embeddings in the same order as the input chunks.
 */
async function generateEmbeddings(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  const apiKey = getGeminiApiKey();
  const allEmbeddings: number[][] = [];

  // Process in batches to avoid API limits
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBEDDING_DIMS,
          })),
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Gemini embedding API error (${response.status}): ${errorBody}`
      );
    }

    const data = await response.json();
    for (const embedding of data.embeddings) {
      allEmbeddings.push(embedding.values);
    }
  }

  return allEmbeddings;
}

// ---------- Main pipeline ----------

/**
 * Process a document: extract text, chunk it, generate embeddings, and store
 * everything in the document_chunks table.
 *
 * This is the main RAG pipeline entry point. Call after a PDF has been uploaded
 * to Supabase Storage.
 *
 * @param documentId - The document UUID (must already exist in `documents` table)
 * @returns true on success, error string on failure
 */
export async function processDocument(
  documentId: string
): Promise<{ success: true } | { success: false; error: string }> {
  console.log("[processDocument] Starting for document:", documentId);
  const supabase = await createClient();

  try {
    // 1. Get the document record
    console.log("[processDocument] Fetching document record...");
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      console.error("[processDocument] Document not found:", docError?.message);
      return { success: false, error: "Document not found." };
    }
    console.log("[processDocument] Document found:", doc.file_name, "file_url:", doc.file_url);

    // 2. Download the PDF from Supabase Storage
    console.log("[processDocument] Downloading PDF from storage...");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("pdfs")
      .download(doc.file_url);

    if (downloadError || !fileData) {
      console.error("[processDocument] Download failed:", downloadError?.message);
      await updateDocumentStatus(documentId, "failed");
      return {
        success: false,
        error: `Failed to download PDF: ${downloadError?.message ?? "unknown"}`,
      };
    }
    console.log("[processDocument] PDF downloaded, size:", fileData.size);

    // 3. Extract text from PDF
    console.log("[processDocument] Extracting text...");
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { pages, totalPages } = await extractTextFromPdf(buffer);
    console.log("[processDocument] Extracted", pages.length, "pages, total:", totalPages);

    if (pages.length === 0) {
      console.error("[processDocument] No text extracted");
      await updateDocumentStatus(documentId, "failed");
      return { success: false, error: "Could not extract any text from the PDF." };
    }

    // Update total_pages on the document
    await updateDocumentStatus(documentId, "processing", {
      total_pages: totalPages,
    });

    // 4. Chunk the text
    console.log("[processDocument] Chunking text...");
    const chunks = chunkText(pages);
    console.log("[processDocument] Generated", chunks.length, "chunks");
    if (chunks.length === 0) {
      console.error("[processDocument] No chunks generated");
      await updateDocumentStatus(documentId, "failed");
      return { success: false, error: "No text chunks could be generated." };
    }

    // 5. Generate embeddings
    console.log("[processDocument] Generating embeddings for", chunks.length, "chunks...");
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));
    console.log("[processDocument] Embeddings generated:", embeddings.length);

    // 6. Insert chunks with embeddings into document_chunks
    console.log("[processDocument] Inserting chunks into database...");
    const rows = chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: i,
      content: chunk.content,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      token_count: chunk.token_count,
      embedding: JSON.stringify(embeddings[i]),
    }));

    // Insert in batches of 50 to avoid payload size limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      console.log("[processDocument] Inserting batch", Math.floor(i / BATCH_SIZE) + 1, "of", Math.ceil(rows.length / BATCH_SIZE));
      const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(batch);

      if (insertError) {
        console.error("[processDocument] Chunk insert failed:", insertError.message);
        await updateDocumentStatus(documentId, "failed");
        return {
          success: false,
          error: `Failed to store chunks: ${insertError.message}`,
        };
      }
    }

    // 7. Mark document as ready
    console.log("[processDocument] All chunks inserted. Marking as ready...");
    await updateDocumentStatus(documentId, "ready");
    console.log("[processDocument] Document processing complete!");
    return { success: true };
  } catch (err) {
    console.error("[processDocument] Unexpected error:", err);
    await updateDocumentStatus(documentId, "failed");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown processing error.",
    };
  }
}

/**
 * Search for relevant chunks using cosine similarity via the
 * match_document_chunks RPC function.
 */
export async function searchChunks(
  documentId: string,
  query: string,
  matchCount: number = 8,
  matchThreshold: number = 0.3
): Promise<
  Array<{
    id: string;
    chunk_index: number;
    content: string;
    page_start: number;
    page_end: number;
    token_count: number;
    similarity: number;
  }>
> {
  const supabase = await createClient();

  // Generate embedding for the query using RETRIEVAL_QUERY task type
  const [queryEmbedding] = await generateEmbeddings([query], "RETRIEVAL_QUERY");

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    target_document_id: documentId,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Chunk search error:", error.message);
    return [];
  }

  return data ?? [];
}
