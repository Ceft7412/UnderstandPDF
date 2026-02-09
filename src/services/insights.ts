"use server";

import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------- Types ----------

export interface LocalSource {
  type: "local";
  page: number;
  section: string;
  quote: string;
}

export type Source = LocalSource;

export interface ResearchDirection {
  /** e.g. "Adjacent Field", "Alternative Approach", "Contrasting Theory", "Cross-Discipline" */
  category: string;
  /** Short label for the direction */
  title: string;
  /** 1-2 sentence explanation of why this is relevant and what to look for */
  description: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  sources: Source[];
  researchDirections: ResearchDirection[];
}

/** Metadata the client needs to orchestrate group-by-group extraction */
export interface InsightPlan {
  totalChunks: number;
  totalGroups: number;
}

// ---------- Config ----------

/** Number of chunks to process per batch */
const CHUNKS_PER_GROUP = 10;

// ---------- Internal helpers ----------

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Prompt for extracting insights from a group of chunks.
 */
const EXTRACT_PROMPT = `You are an expert research assistant. Given text chunks from a section of a PDF document, extract every key insight you find.

For each insight:
1. **Extract the insight** — a concise finding, method, conclusion, claim, argument, or implication from the text, grounded in direct quotes.
2. **Suggest research directions** — using your knowledge of the broader academic landscape, suggest 2-4 directions the reader should explore to deepen their understanding.

Research direction categories:
- "Adjacent Field" — a neighboring discipline or subfield that studies related phenomena
- "Alternative Approach" — a different methodology or framework for the same question
- "Contrasting Theory" — a competing or complementary theoretical perspective
- "Cross-Discipline" — an unexpected connection to a different field entirely

Rules:
- Extract ALL meaningful insights from the provided chunks — do NOT limit yourself to a fixed number
- Typically expect 2-5 insights per group of chunks, but extract more if the content is dense
- Each insight needs a concise title (max 10 words) and a clear description (2-3 sentences)
- Include 1-3 source citations per insight with page number, section label, and a short direct quote
- Each insight should be distinct — do not repeat the same point
- 2-4 research directions per insight, be specific — name actual fields, theories, or study types

Return valid JSON only, no markdown fences. Use this exact structure:
[
  {
    "title": "string",
    "description": "string",
    "sources": [
      { "type": "local", "page": number, "section": "string", "quote": "string" }
    ],
    "researchDirections": [
      { "category": "Adjacent Field | Alternative Approach | Contrasting Theory | Cross-Discipline", "title": "string", "description": "string" }
    ]
  }
]`;

/**
 * Prompt for the merge/dedup pass.
 */
const MERGE_PROMPT = `You are an expert research assistant. You have been given a list of raw insights extracted from different sections of the same PDF document. Some insights may overlap, repeat, or cover the same topic from different angles.

Your job:
1. **Merge** insights that cover the same topic — combine their descriptions, sources, and research directions into a single stronger insight
2. **Deduplicate** — remove redundant insights that say the same thing
3. **Keep all distinct insights** — do NOT drop insights just to reduce count. If two insights cover genuinely different points, keep both.
4. **Preserve all source citations** — when merging, keep all unique source citations from the originals
5. **Preserve research directions** — when merging, keep the best 2-4 research directions (remove exact duplicates)

Rules:
- The final list should cover the ENTIRE document comprehensively
- Every significant finding, method, conclusion, or argument should be represented
- Titles should be concise (max 10 words), descriptions 2-3 sentences
- Return valid JSON only, no markdown fences, same structure as input

Return the consolidated insights as a JSON array:
[
  {
    "title": "string",
    "description": "string",
    "sources": [
      { "type": "local", "page": number, "section": "string", "quote": "string" }
    ],
    "researchDirections": [
      { "category": "Adjacent Field | Alternative Approach | Contrasting Theory | Cross-Discipline", "title": "string", "description": "string" }
    ]
  }
]`;

// ---------- Raw insight type (before ID assignment) ----------

interface RawInsight {
  title: string;
  description: string;
  sources: Array<{
    type: "local";
    page: number;
    section: string;
    quote: string;
  }>;
  researchDirections: Array<{
    category: string;
    title: string;
    description: string;
  }>;
}

/** Convert raw insights to typed Insight objects with IDs */
function assignIds(raw: RawInsight[], documentId: string): Insight[] {
  return raw.map((item, index) => ({
    id: `insight-${documentId.slice(0, 8)}-${index}`,
    title: item.title,
    description: item.description,
    sources: (item.sources ?? []).map((s) => ({
      type: "local" as const,
      page: s.page,
      section: s.section,
      quote: s.quote,
    })),
    researchDirections: (item.researchDirections ?? []).map((rd) => ({
      category: rd.category,
      title: rd.title,
      description: rd.description,
    })),
  }));
}

// ---------- Cache helpers ----------

async function getCachedInsights(
  documentId: string
): Promise<Insight[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_insights")
    .select("insights")
    .eq("document_id", documentId)
    .single();

  if (error || !data) return null;

  try {
    const insights = data.insights as Insight[];
    if (Array.isArray(insights) && insights.length > 0) {
      return insights;
    }
  } catch {
    // Malformed JSON — treat as cache miss
  }

  return null;
}

async function cacheInsights(
  documentId: string,
  insights: Insight[]
): Promise<void> {
  const supabase = await createClient();

  await supabase.from("document_insights").upsert(
    {
      document_id: documentId,
      insights: insights as unknown as Record<string, unknown>[],
    },
    { onConflict: "document_id" }
  );
}

// ---------- Public server actions ----------

/**
 * Check for cached insights. Returns them if available, null otherwise.
 * The client should call this first — if it returns insights, skip extraction.
 */
export async function getCachedDocumentInsights(
  documentId: string
): Promise<Insight[] | null> {
  return getCachedInsights(documentId);
}

/**
 * Get the plan for insight extraction: how many chunks and groups exist.
 * The client uses this to know how many extractGroup calls to make.
 */
export async function getInsightPlan(
  documentId: string
): Promise<InsightPlan | null> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);

  if (error || count === null || count === 0) return null;

  return {
    totalChunks: count,
    totalGroups: Math.ceil(count / CHUNKS_PER_GROUP),
  };
}

/**
 * Extract insights for a single group of chunks (0-indexed).
 * Returns typed Insight[] with IDs so the client can render immediately.
 */
export async function extractGroupInsights(
  documentId: string,
  groupIndex: number,
  totalGroups: number
): Promise<Insight[]> {
  const supabase = await createClient();
  const genAI = getGeminiClient();

  // Fetch only the chunks for this group
  const offset = groupIndex * CHUNKS_PER_GROUP;
  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("chunk_index, content, page_start, page_end")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true })
    .range(offset, offset + CHUNKS_PER_GROUP - 1);

  if (error || !chunks || chunks.length === 0) {
    console.error(
      `[insights] Failed to fetch chunks for group ${groupIndex}:`,
      error?.message
    );
    return [];
  }

  const context = chunks
    .map(
      (c) =>
        `[Chunk ${c.chunk_index}, Pages ${c.page_start}-${c.page_end}]\n${c.content}`
    )
    .join("\n\n---\n\n");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: EXTRACT_PROMPT,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 16000,
      responseMimeType: "application/json",
    },
  });

  console.log(
    `[insights] Extracting group ${groupIndex + 1}/${totalGroups} (${chunks.length} chunks, pages ${chunks[0]?.page_start}-${chunks[chunks.length - 1]?.page_end})`
  );

  const result = await model.generateContent(
    `Here are text chunks from section ${groupIndex + 1} of ${totalGroups} of the document:\n\n${context}\n\nExtract all key insights from these chunks.`
  );

  const responseText = result.response.text().trim();
  if (!responseText) {
    console.warn(`[insights] Empty response for group ${groupIndex + 1}`);
    return [];
  }

  const raw = JSON.parse(responseText) as RawInsight[];
  console.log(
    `[insights] Group ${groupIndex + 1}: extracted ${raw.length} insights`
  );

  // Use group-scoped IDs so they don't collide across groups
  return raw.map((item, i) => ({
    id: `insight-${documentId.slice(0, 8)}-g${groupIndex}-${i}`,
    title: item.title,
    description: item.description,
    sources: (item.sources ?? []).map((s) => ({
      type: "local" as const,
      page: s.page,
      section: s.section,
      quote: s.quote,
    })),
    researchDirections: (item.researchDirections ?? []).map((rd) => ({
      category: rd.category,
      title: rd.title,
      description: rd.description,
    })),
  }));
}

/**
 * Merge and deduplicate insights from all groups, then cache the final result.
 * Called by the client after all groups have been extracted.
 * For small sets (<=6), skips the LLM merge and just caches directly.
 * Returns the final merged + cached insights.
 */
export async function mergeAndCacheInsights(
  documentId: string,
  allInsights: Insight[]
): Promise<Insight[]> {
  // Small set — no merge needed, just re-ID and cache
  if (allInsights.length <= 6) {
    console.log(
      `[insights] Only ${allInsights.length} insights, skipping merge`
    );
    const final = allInsights.map((item, index) => ({
      ...item,
      id: `insight-${documentId.slice(0, 8)}-${index}`,
    }));
    await cacheInsights(documentId, final);
    return final;
  }

  console.log(`[insights] Merging ${allInsights.length} raw insights...`);

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: MERGE_PROMPT,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 32000,
      responseMimeType: "application/json",
    },
  });

  // Strip IDs for the merge prompt — they'll be re-assigned after
  const stripped = allInsights.map(({ id: _id, ...rest }) => rest);

  const result = await model.generateContent(
    `Here are all the raw insights extracted from different sections of the document:\n\n${JSON.stringify(stripped, null, 2)}\n\nMerge overlapping insights and deduplicate while preserving all distinct findings.`
  );

  const responseText = result.response.text().trim();
  if (!responseText) {
    console.warn("[insights] Empty merge response, caching unmerged");
    const final = allInsights.map((item, index) => ({
      ...item,
      id: `insight-${documentId.slice(0, 8)}-${index}`,
    }));
    await cacheInsights(documentId, final);
    return final;
  }

  const merged = JSON.parse(responseText) as RawInsight[];
  console.log(
    `[insights] Merge complete: ${allInsights.length} → ${merged.length} insights`
  );

  const final = assignIds(merged, documentId);
  await cacheInsights(documentId, final);
  return final;
}

/**
 * Legacy single-call function kept for backward compatibility.
 * Checks cache, generates all insights, merges, caches.
 */
export async function generateInsights(
  documentId: string
): Promise<Insight[]> {
  const cached = await getCachedInsights(documentId);
  if (cached) return cached;

  const plan = await getInsightPlan(documentId);
  if (!plan) return [];

  // Extract all groups in parallel
  const groupResults = await Promise.all(
    Array.from({ length: plan.totalGroups }, (_, i) =>
      extractGroupInsights(documentId, i, plan.totalGroups)
    )
  );

  const allInsights = groupResults.flat();
  if (allInsights.length === 0) return [];

  return mergeAndCacheInsights(documentId, allInsights);
}

/**
 * Force regenerate insights for a document, bypassing the cache.
 */
export async function regenerateInsights(
  documentId: string
): Promise<Insight[]> {
  const supabase = await createClient();
  await supabase
    .from("document_insights")
    .delete()
    .eq("document_id", documentId);

  return generateInsights(documentId);
}
