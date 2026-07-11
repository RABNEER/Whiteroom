import { db } from "../lib/db.js";
import { classroomFileChunks } from "@whiteroom/db";
import { env } from "../lib/env.js";
import { getEmbedding } from "./walt.js";

/**
 * Clean and chunk text into sizes suitable for embeddings with overlap
 */
export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return [];

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex < cleanText.length) {
      // Find the nearest space to avoid cutting words in half
      const nextSpace = cleanText.lastIndexOf(" ", endIndex);
      if (nextSpace > startIndex) {
        endIndex = nextSpace;
      }
    } else {
      endIndex = cleanText.length;
    }

    const chunk = cleanText.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = endIndex - overlap;
    if (startIndex >= cleanText.length || endIndex === cleanText.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Downloads a file as a buffer, sends it to Gemini to extract text content,
 * chunks it, generates embeddings, and inserts into classroomFileChunks.
 */
export async function ingestClassroomFile(
  fileRecord: {
    id: string;
    tenantId: string;
    classId: string;
    url: string;
    name: string;
    type: string;
  },
  fileBuffer?: Buffer
): Promise<void> {
  const geminiApiKey = env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.warn("⚠️ [INGESTION] GEMINI_API_KEY is not set. Ingestion skipped (mocking or dry-run).");
    return;
  }

  // 1. Determine MIME type and skip unsupported non-text types (like video/zip unless we just parse name/metadata)
  let mimeType = "application/pdf";
  if (fileRecord.type === "image") mimeType = "image/png";
  else if (fileRecord.type === "pdf") mimeType = "application/pdf";
  else if (fileRecord.type === "other" && fileRecord.name.endsWith(".txt")) mimeType = "text/plain";
  else {
    console.log(`ℹ️ [INGESTION] Skipping text extraction for unsupported file type: ${fileRecord.type} (${fileRecord.name})`);
    return;
  }

  try {
    let buffer = fileBuffer;

    // 2. Download file if buffer not supplied
    if (!buffer) {
      console.log(`📥 [INGESTION] Downloading file for parsing: ${fileRecord.name} (${fileRecord.url})`);
      const response = await fetch(fileRecord.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // 3. Send file data to Gemini 1.5 Flash to extract text
    console.log(`🧠 [INGESTION] Asking Gemini to extract text from ${fileRecord.name}...`);
    const base64Data = buffer.toString("base64");

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: "Extract all notes, textbook content, study points, questions, equations, and context from this file. Format it as plain text. Do not add greetings or commentary. Output the content directly.",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => "");
      throw new Error("Gemini parser API returned an error response");
    }

    const json = (await geminiRes.json()) as any;
    const extractedText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      console.warn(`⚠️ [INGESTION] No text extracted from file: ${fileRecord.name}`);
      return;
    }

    console.log(`📝 [INGESTION] Extracted ${extractedText.length} characters. Chunking...`);

    // 4. Chunk text
    const chunks = chunkText(extractedText);
    console.log(`🧩 [INGESTION] Generated ${chunks.length} chunks. Generating embeddings...`);

    // 5. Generate embeddings and save to DB
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);

      await db.insert(classroomFileChunks).values({
        tenantId: fileRecord.tenantId,
        fileId: fileRecord.id,
        content: chunk,
        pageNumber: i + 1, // Treat chunk index as virtual page number
        embedding: embedding,
      });
    }

    console.log(`✅ [INGESTION] Successfully completed ingestion and vector embedding for ${fileRecord.name}`);
  } catch (err) {
    console.error(`❌ [INGESTION] Failed to ingest and chunk file ${fileRecord.name}:`, err);
  }
}
