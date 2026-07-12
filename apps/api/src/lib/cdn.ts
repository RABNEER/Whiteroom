import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";


// 2. Cloudflare R2 / S3 Configuration
const r2AccessKeyId = env.R2_ACCESS_KEY_ID || "";
const r2SecretAccessKey = env.R2_SECRET_ACCESS_KEY || "";
const cloudflareAccountId = env.CLOUDFLARE_ACCOUNT_ID || "";
const r2BucketName = env.R2_BUCKET_NAME || "classroom-media";
const r2PublicUrlPrefix = env.R2_PUBLIC_URL_PREFIX || "";

let s3Client: S3Client | null = null;
const isR2Configured = !!(r2AccessKeyId && r2SecretAccessKey && cloudflareAccountId);

if (isR2Configured) {
  s3Client = new S3Client({
    region: "apac",
    endpoint: `https://${cloudflareAccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

// 3. Fallback Supabase Setup
const supabaseUrl = env.SUPABASE_URL || (() => {
  const match = env.DATABASE_URL?.match(/postgres\.([a-z0-9]+)/i);
  return match ? `https://${match[1]}.supabase.co` : "";
})();
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials missing for fallback storage");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

// 4. Local Chunk Storage Configuration
const CHUNK_DIR = path.join(tmpdir(), "whiteroom_chunks");

/**
 * Upload/save a raw chunk to temporary local storage.
 * Returns the local file path.
 */
export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  buffer: Buffer
): Promise<string> {
  const chunkPath = path.join(CHUNK_DIR, sessionId, String(chunkIndex));
  await fs.mkdir(path.dirname(chunkPath), { recursive: true });
  await fs.writeFile(chunkPath, buffer);
  return chunkPath;
}

/**
 * Delete a single chunk from local storage.
 */
export async function deleteChunk(storagePath: string): Promise<void> {
  try {
    await fs.rm(storagePath, { force: true });
  } catch (err) {
    console.error(`❌ [CDN] Failed to delete local chunk at ${storagePath}:`, err);
  }
}

/**
 * Concatenate temporary local chunks, upload the final file to Google Drive, R2, or Supabase,
 * and clean up the local chunks.
 */
export async function assembleChunks(
  tenantId: string,
  sessionId: string,
  fileName: string,
  contentType: string,
  chunkPaths: string[]
): Promise<{ url: string; size: number }> {
  const buffers: Buffer[] = [];

  // 1. Read all local chunks in sequence
  for (const chunkPath of chunkPaths) {
    try {
      const bytes = await fs.readFile(chunkPath);
      buffers.push(bytes);
    } catch (err) {
      throw new Error(`Failed to read chunk at ${chunkPath}: ${(err as Error).message}`);
    }
  }

  // 2. Concatenate chunk buffers
  const finalBuffer = Buffer.concat(buffers);
  const size = finalBuffer.length;

  // 3. Upload final file
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalPath = `${tenantId}/${timestamp}_${sanitizedName}`;
  let finalUrl = "";

  const localStoragePath = env.LOCAL_STORAGE_PATH || process.env.LOCAL_STORAGE_PATH || "G:\\My Drive\\Whiteroom";
  if (localStoragePath) {
    console.log(`📤 [CDN] Saving ${sanitizedName} (${size} bytes) to local disk: ${localStoragePath}`);
    const fullPath = path.join(localStoragePath, finalPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, finalBuffer);

    const baseUrl = env.ADMIN_URL || process.env.ADMIN_URL || "http://localhost:3000";
    finalUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/storage/files/${finalPath}`;
    console.log(`✅ [CDN] Saved to local disk: ${finalUrl}`);
  } else if (s3Client) {
    // Upload to Cloudflare R2
    console.log(`📤 [CDN] Uploading ${sanitizedName} to Cloudflare R2...`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: finalPath,
        Body: finalBuffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, no-transform",
      })
    );
    finalUrl = r2PublicUrlPrefix
      ? `${r2PublicUrlPrefix}/${finalPath}`
      : `https://${cloudflareAccountId}.r2.cloudflarestorage.com/${r2BucketName}/${finalPath}`;
  } else {
    // Fallback to Supabase Storage
    console.log(`📤 [CDN] Uploading ${sanitizedName} to Supabase Storage...`);
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from("classroom-media")
      .upload(finalPath, finalBuffer, {
        contentType,
        cacheControl: "31536000, no-transform",
        upsert: false,
        duplex: "half",
      });

    if (error) {
      throw new Error(`Assembled file upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("classroom-media")
      .getPublicUrl(finalPath);
    
    finalUrl = urlData.publicUrl;
  }

  // 4. Delete chunks and parent session directory
  for (const chunkPath of chunkPaths) {
    deleteChunk(chunkPath).catch((err) => {
      console.error(`❌ [CDN] Failed to clean up chunk ${chunkPath}:`, err);
    });
  }
  if (chunkPaths.length > 0) {
    const sessionDir = path.dirname(chunkPaths[0]);
    fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    url: finalUrl,
    size,
  };
}
