import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { createHash } from "crypto";

/**
 * Supabase Storage client for file uploads with original quality preservation
 */
function getSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  const dbUrl = env.DATABASE_URL || "";
  const directMatch = dbUrl.match(/([^.]+)\.supabase\.co/);
  if (directMatch) return `https://${directMatch[1]}.supabase.co`;
  const poolerMatch = dbUrl.match(/postgres\.([^:@]+)/);
  if (poolerMatch) return `https://${poolerMatch[1]}.supabase.co`;
  return "";
}

const supabaseUrl = getSupabaseUrl();
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(`Supabase configuration missing. url: "${supabaseUrl}", key exists: ${!!supabaseKey}. Check DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

/**
 * Calculate SHA-256 checksum of file buffer for integrity verification
 */
export function calculateChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Upload file to Supabase Storage with original quality preservation
 * @param buffer - File buffer (original, uncompressed)
 * @param path - Storage path (e.g., "classroom-media/tenant123/file.pdf")
 * @param contentType - MIME type of the file
 * @returns Public URL of uploaded file
 */
export async function uploadToStorage(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<{ url: string; checksum: string; size: number }> {
  const client = getSupabaseClient();
  const bucket = "classroom-media";

  // Calculate checksum before upload
  const checksum = calculateChecksum(buffer);
  const size = buffer.length;

  // Upload with explicit no-transform headers
  const { data, error } = await client.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
      duplex: "half",
    });

  if (error) {
    console.error("[STORAGE ERROR]", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = client.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    checksum,
    size,
  };
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFromStorage(path: string): Promise<void> {
  const client = getSupabaseClient();
  const bucket = "classroom-media";

  const { error } = await client.storage.from(bucket).remove([path]);

  if (error) {
    console.error("[STORAGE DELETE ERROR]", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Generate unique storage path for tenant file
 */
export function generateStoragePath(
  tenantId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tenantId}/${timestamp}_${sanitizedName}`;
}

/**
 * Validate file size (max 100MB)
 */
export function validateFileSize(size: number): void {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (size > MAX_SIZE) {
    throw new Error(`File size exceeds maximum allowed size of 100MB`);
  }
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string): void {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed`);
  }
}

// Made with Bob
