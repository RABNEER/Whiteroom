import { db } from "../lib/db.js";
import {
  classroomFiles,
  classroomFileChunks,
  waltQuizzes,
  attendanceSessions,
  eq,
  and,
  sql,
} from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { env } from "../lib/env.js";

// ─── PII Scrubber ───
export function scrubPII(text: string): string {
  let scrubbed = text;
  
  // 1. Scrub emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  scrubbed = scrubbed.replace(emailRegex, "[EMAIL]");

  // 2. Scrub phone numbers (various formats including +91, domestic 10-digit)
  const phoneRegex = /(\+91[\-\s]?)?[789]\d{9}\b|\b\d{10}\b/g;
  scrubbed = scrubbed.replace(phoneRegex, "[PHONE]");

  return scrubbed;
}

// ─── Gemini API Wrappers ───
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    // Deterministic mock embedding for offline tests (1536 dimensions)
    const mockEmbedding = new Array(1536).fill(0);
    for (let i = 0; i < 1536; i++) {
      mockEmbedding[i] = Math.sin(i + text.length) * 0.02;
    }
    return mockEmbedding;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini Embedding API returned ${res.status}`);
    }

    const json = (await res.json()) as any;
    return json.embedding.values;
  } catch (err) {
    console.error("Gemini embedding failed, falling back to mock:", err);
    const mockEmbedding = new Array(1536).fill(0);
    return mockEmbedding;
  }
}

export async function generateCompletion(
  prompt: string,
  jsonMode = false
): Promise<string> {
  const groqApiKey = env.GROQ_API_KEY;
  const geminiApiKey = env.GEMINI_API_KEY;

  if (env.NODE_ENV === "test" || (!groqApiKey && !geminiApiKey)) {
    // Mock completions for offline tests
    if (jsonMode) {
      if (prompt.includes("quiz")) {
        return JSON.stringify([
          {
            question: "What is 2 + 2?",
            options: ["3", "4", "5", "6"],
            answerIndex: 1,
          },
        ]);
      }
      if (prompt.includes("flashcard")) {
        return JSON.stringify([
          {
            front: "Concept front side",
            back: "Concept back explanation",
          },
        ]);
      }
      if (prompt.includes("notice")) {
        return JSON.stringify({
          title: "Mock Bulletin Draft",
          body: "This is a drafted notice body based on files.",
        });
      }
    }
    return "This is a mock Walt AI doubt response grounded in classroom files.";
  }

  // 1. Try Groq if key is present
  if (groqApiKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "llama-3.3-70b-specdec",
          messages: [{ role: "user", content: prompt }],
          response_format: jsonMode ? { type: "json_object" } : undefined,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        return json.choices[0].message.content;
      }
      const errBody = await res.text().catch(() => "");
      console.warn(`Groq Completion API returned status ${res.status}. Body: ${errBody}. Falling back to Gemini.`);
    } catch (err) {
      console.error("Groq completion failed, falling back to Gemini:", err);
    }
  }

  // 2. Fallback to Gemini
  if (geminiApiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: jsonMode
              ? { responseMimeType: "application/json" }
              : undefined,
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Gemini Completion API returned ${res.status}. Body: ${errBody}`);
      }

      const json = (await res.json()) as any;
      return json.candidates[0].content.parts[0].text;
    } catch (err: any) {
      console.error("Gemini completion failed:", err);
      throw Errors.internal(`Failed to obtain response from LLM provider: ${err?.message || err}`);
    }
  }

  throw Errors.internal("No active LLM model provider available. Please set GROQ_API_KEY or GEMINI_API_KEY in .env");
}

// ─── Doubt Solver (RAG Grounded) ───
export async function solveDoubt(
  tenantId: string,
  classId: string,
  rawQuestion: string,
  userRole?: string
): Promise<{ answer: string; citations: any[] }> {
  // 1. Scrub PII
  const cleanQuestion = scrubPII(rawQuestion);

  const isTeacher = userRole === "teacher" || userRole === "school_admin";

  // 2. Fetch question embedding
  const embedding = await getEmbedding(cleanQuestion);
  const embeddingString = `[${embedding.join(",")}]`;

  // 3. Vector search closest chunks (using raw SQL because pgvector needs <=> operator)
  const query = sql`
    SELECT c.id, c.content, c.page_number as "pageNumber", f.name as "fileName", f.url as "fileUrl",
           (1 - (c.embedding <=> ${embeddingString}::vector)) as similarity
    FROM classroom_file_chunks c
    JOIN classroom_files f ON c.file_id = f.id
    WHERE f.class_id = ${classId} AND f.tenant_id = ${tenantId}
    ORDER BY c.embedding <=> ${embeddingString}::vector
    LIMIT 3;
  `;

  const rows = (await db.execute(query)) as any[];

  // 4. Scope gating: If no materials exist or similarity threshold is not met (threshold 0.5)
  const threshold = 0.5;
  const validChunks = rows.filter((r) => Number(r.similarity) >= threshold);

  if (validChunks.length === 0 && !isTeacher) {
    return {
      answer: "I'm sorry, but that question is outside the scope of the materials uploaded for this classroom.",
      citations: [],
    };
  }

  // 5. Assemble grounding context
  const context = validChunks
    .map((c, i) => `[Source ${i + 1}]: "${c.fileName}", Page ${c.pageNumber}\nContent: ${c.content}`)
    .join("\n\n");

  let prompt = "";
  if (isTeacher) {
    prompt = `You are Walt, an AI teaching assistant. A teacher is asking you a question.
${context ? `Here are some potentially relevant classroom materials:\n${context}\n\n` : ""}
Question: ${cleanQuestion}

Please write a clear, helpful response. ${context ? 'Cite the source files (e.g. "[Source 1]") if you refer to them. ' : ""}You may answer using your general knowledge since the user is a teacher.`;
  } else {
    prompt = `You are Walt, an AI teaching assistant. Answer the student's question using ONLY the provided classroom materials. Do not use external or general knowledge. If the provided materials do not contain the answer, reply that you don't know based on the uploaded files.

Classroom Materials:
${context}

Student Question: ${cleanQuestion}

Please write a clear, helpful response. Cite the source files (e.g. "[Source 1]") when referring to information.`;
  }

  const answer = await generateCompletion(prompt);

  const citations = validChunks.map((c, i) => ({
    sourceNumber: i + 1,
    fileName: c.fileName as string,
    fileUrl: c.fileUrl as string,
    pageNumber: c.pageNumber as number,
  }));

  return { answer, citations };
}

// ─── Quiz Generator ───
export async function generateQuizFromFiles(
  tenantId: string,
  classId: string,
  title: string
): Promise<any> {
  // 1. Fetch file texts
  const chunks = await db
    .select({ content: classroomFileChunks.content })
    .from(classroomFileChunks)
    .innerJoin(classroomFiles, eq(classroomFileChunks.fileId, classroomFiles.id))
    .where(
      and(
        eq(classroomFiles.classId, classId),
        eq(classroomFiles.tenantId, tenantId)
      )
    )
    .limit(10); // limit context size for safety

  if (chunks.length === 0) {
    throw Errors.validation("No classroom materials uploaded to generate quiz from");
  }

  const combinedText = chunks.map((c) => c.content).join("\n\n");

  const prompt = `Based on the following study materials, generate a multiple-choice quiz with 3 to 5 conceptual questions.
Each question must have a question text, exactly 4 options, and the 0-indexed answerIndex of the correct option.
Return the output as a JSON array of objects conforming to this schema:
[
  { "question": "Question text here", "options": ["Option A", "Option B", "Option C", "Option D"], "answerIndex": 1 }
]

Study Materials:
${combinedText}`;

  const jsonText = await generateCompletion(prompt, true);
  let questions: any[];
  try {
    questions = JSON.parse(jsonText);
  } catch {
    throw Errors.internal("AI returned invalid JSON quiz format");
  }

  const [quiz] = await db
    .insert(waltQuizzes)
    .values({
      tenantId,
      classId,
      title,
      questions,
    })
    .returning();

  return quiz!;
}

// ─── Flashcards ───
export async function generateFlashcardsFromFiles(
  tenantId: string,
  classId: string
): Promise<any[]> {
  const chunks = await db
    .select({ content: classroomFileChunks.content })
    .from(classroomFileChunks)
    .innerJoin(classroomFiles, eq(classroomFileChunks.fileId, classroomFiles.id))
    .where(
      and(
        eq(classroomFiles.classId, classId),
        eq(classroomFiles.tenantId, tenantId)
      )
    )
    .limit(10);

  if (chunks.length === 0) {
    throw Errors.validation("No classroom materials uploaded to generate flashcards from");
  }

  const combinedText = chunks.map((c) => c.content).join("\n\n");

  const prompt = `Based on the following study materials, extract 4 to 8 key concepts and summarize them as flashcards.
Return the output as a JSON array of objects conforming to this schema:
[
  { "front": "Term or Question", "back": "Brief summary explanation or answer" }
]

Study Materials:
${combinedText}`;

  const jsonText = await generateCompletion(prompt, true);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw Errors.internal("AI returned invalid JSON flashcards format");
  }
}

// ─── Auto Draft Notice ───
export async function autoDraftNotice(
  tenantId: string,
  classId: string,
  instructions: string
): Promise<any> {
  const chunks = await db
    .select({ content: classroomFileChunks.content })
    .from(classroomFileChunks)
    .innerJoin(classroomFiles, eq(classroomFileChunks.fileId, classroomFiles.id))
    .where(
      and(
        eq(classroomFiles.classId, classId),
        eq(classroomFiles.tenantId, tenantId)
      )
    )
    .limit(5);

  const combinedText = chunks.map((c) => c.content).join("\n\n");

  const prompt = `Draft a formal school notice or bulletin announcement.
Instructions/Intent: ${instructions}
Context from classroom files (if any): ${combinedText}

Return the output as a JSON object matching this schema:
{
  "title": "Bulletin Title",
  "body": "Detailed notice body text here"
}`;

  const jsonText = await generateCompletion(prompt, true);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw Errors.internal("AI returned invalid JSON notice draft format");
  }
}

// ─── Principal Insights Dashboard ───
export async function getPrincipalInsights(tenantId: string): Promise<{
  attendanceRate: number;
  totalClasses: number;
  conceptGaps: any[];
}> {
  // 1. Concept Gap Insights (Mocked based on query trends)
  const conceptGaps = [
    { topic: "Calculus Limits", studentQueriesCount: 24, status: "needs_review" },
    { topic: "Photosynthesis Light Reaction", studentQueriesCount: 15, status: "needs_review" },
    { topic: "Newtonian Gravity", studentQueriesCount: 8, status: "satisfactory" },
  ];

  // 2. Real Attendance Trends (Calculate aggregate tenant stats)
  const sessions = await db
    .select({
      totalPresent: attendanceSessions.totalPresent,
      totalAbsent: attendanceSessions.totalAbsent,
      totalStudents: attendanceSessions.totalStudents,
    })
    .from(attendanceSessions)
    .where(eq(attendanceSessions.tenantId, tenantId));

  let totalPresent = 0;
  let totalAbsent = 0;
  sessions.forEach((s) => {
    totalPresent += s.totalPresent ?? 0;
    totalAbsent += s.totalAbsent ?? 0;
  });

  const totalMarked = totalPresent + totalAbsent;
  const attendanceRate = totalMarked === 0 ? 0 : Math.round((totalPresent / totalMarked) * 10000) / 100;

  return {
    attendanceRate,
    totalClasses: sessions.length,
    conceptGaps,
  };
}
