import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Initialize Cloudflare R2 / S3 client if keys are present
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const r2BucketName = process.env.R2_BUCKET_NAME || "classroom-media";
const r2PublicUrlPrefix = process.env.R2_PUBLIC_URL_PREFIX || "";

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

// Fallback Supabase setup
const supabaseUrl = env.DATABASE_URL?.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[0] || "";
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

/**
 * Upload a raw chunk to temporary storage.
 * Returns the storage path.
 */
export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  buffer: Buffer
): Promise<string> {
  const path = `chunks/${sessionId}/${chunkIndex}`;

  if (s3Client) {
    // Upload to Cloudflare R2
    await s3Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: path,
        Body: buffer,
        ContentType: "application/octet-stream",
      })
    );
    return path;
  } else {
    // Fallback to Supabase Storage
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from("classroom-media")
      .upload(path, buffer, {
        contentType: "application/octet-stream",
        upsert: true,
        duplex: "half",
      });

    if (error) {
      throw new Error(`Fallback chunk upload failed: ${error.message}`);
    }
    return path;
  }
}

/**
 * Delete a single object from storage.
 */
export async function deleteChunk(storagePath: string): Promise<void> {
  if (s3Client) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: r2BucketName,
        Key: storagePath,
      })
    );
  } else {
    const supabase = getSupabase();
    await supabase.storage.from("classroom-media").remove([storagePath]);
  }
}

/**
 * Download all chunks, concatenate them, upload the final file, and delete chunks.
 */
export async function assembleChunks(
  tenantId: string,
  sessionId: string,
  fileName: string,
  contentType: string,
  chunkPaths: string[]
): Promise<{ url: string; size: number }> {
  const buffers: Buffer[] = [];

  // 1. Download all chunks in sequence
  for (const path of chunkPaths) {
    if (s3Client) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: r2BucketName,
          Key: path,
        })
      );
      if (!response.Body) {
        throw new Error(`Chunk body missing in R2: ${path}`);
      }
      const bytes = await response.Body.transformToByteArray();
      buffers.push(Buffer.from(bytes));
    } else {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from("classroom-media")
        .download(path);

      if (error || !data) {
        throw new Error(`Chunk download failed from Supabase: ${error?.message || "empty data"}`);
      }
      const arrayBuffer = await data.arrayBuffer();
      buffers.push(Buffer.from(arrayBuffer));
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

  if (s3Client) {
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

  // 4. Delete chunks asynchronously/non-blocking
  for (const path of chunkPaths) {
    deleteChunk(path).catch((err) => {
      console.error(`Failed to clean up chunk ${path}:`, err);
    });
  }

  return {
    url: finalUrl,
    size,
  };
}
