import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_BASE_URL, ApiError } from "../api/client";
import { sessionStore } from "../auth/session-store";

// SHA-256 pure JS implementation
function sha256(str: string): string {
  const r = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const s = (n: number, x: number) => x >>> n;
  
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const words: number[] = [];
  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) {
    words[i >>> 2] |= utf8.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  
  const length = utf8.length * 8;
  const wordCount = ((length + 64 >>> 9) << 4) + 16;
  words[wordCount - 1] = length;
  words[(length >>> 5) | 0] |= 0x80 << (24 - (length % 32));

  for (let chunk = 0; chunk < wordCount; chunk += 16) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = words[chunk + i] | 0;
    for (let i = 16; i < 64; i++) {
      const s0 = r(7, w[i-15]) ^ r(18, w[i-15]) ^ s(3, w[i-15]);
      const s1 = r(17, w[i-2]) ^ r(19, w[i-2]) ^ s(10, w[i-2]);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, hs] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = r(6, e) ^ r(11, e) ^ r(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hs + S1 + ch + k[i] + w[i]) | 0;
      const S0 = r(2, a) ^ r(13, a) ^ r(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      hs = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hs) | 0;
  }

  return h.map(x => ("00000000" + (x >>> 0).toString(16)).slice(-8)).join("");
}

const SESSION_PREFIX = "whiteroom_upload_session_";

const sessionStoreWrapper = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS !== "web") {
      try {
        return await SecureStore.getItemAsync(key);
      } catch {
        return null;
      }
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS !== "web") {
      try {
        await SecureStore.setItemAsync(key, value);
      } catch {
        // Ignored
      }
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignored
    }
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS !== "web") {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // Ignored
      }
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignored
    }
  },
};

interface UploadState {
  sessionId: string;
  fileName: string;
  fileSize: number;
  uploadedChunks: number[];
}

export interface ChunkedUploadOptions {
  classId: string;
  file: { uri: string; name: string; type: string };
  category: string;
  onProgress: (progress: number) => void;
  onSuccess: (fileRecord: any) => void;
  onError: (err: any) => void;
}

export async function uploadFileInChunks(options: ChunkedUploadOptions) {
  const { classId, file, category, onProgress, onSuccess, onError } = options;

  try {
    // 1. Resolve and extract base64 data
    let base64Data = "";
    if (file.uri.startsWith("data:")) {
      const match = file.uri.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid base64 Data URI format");
      base64Data = match[2];
    } else {
      throw new Error("Only base64 Data URI payloads are supported for uncompressed uploads in this client version.");
    }

    // 2. Compute local checksum of the base64 content
    const checksum = sha256(base64Data);
    let padding = 0;
    if (base64Data.endsWith("==")) {
      padding = 2;
    } else if (base64Data.endsWith("=")) {
      padding = 1;
    }
    const fileSize = (base64Data.length * 3) / 4 - padding;
    
    // Chunk size: 1MB (binary) -> 1,398,104 characters in base64 (each 3 bytes = 4 chars)
    const base64ChunkSize = 1398104;
    const totalChunks = Math.ceil(base64Data.length / base64ChunkSize);

    // 3. Check for existing persisted session
    const storageKey = `${SESSION_PREFIX}${checksum}`;
    const cachedSessionStr = await sessionStoreWrapper.getItem(storageKey);
    let sessionState: UploadState | null = null;

    if (cachedSessionStr) {
      try {
        const parsed = JSON.parse(cachedSessionStr) as UploadState;
        // Verify session status with API
        const { accessToken } = sessionStore.getState();
        const res = await fetch(`${API_BASE_URL}/upload/status/${parsed.sessionId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (res.ok) {
          const statusResult = await res.json();
          if (statusResult.success && statusResult.data.status === "pending") {
            sessionState = parsed;
            console.log(`🔌 [Chunked-Upload] Resuming session ${parsed.sessionId}`);
          }
        }
      } catch (err) {
        console.warn("Failed to restore cached session", err);
      }
    }

    // 4. Initialize session if not resuming
    if (!sessionState) {
      const { accessToken } = sessionStore.getState();
      const res = await fetch(`${API_BASE_URL}/upload/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          classId,
          fileName: file.name,
          fileSize,
          mimeType: file.type,
          category,
          checksum,
        }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new ApiError(errPayload.error?.code || "INIT_FAILED", errPayload.error?.message || "Failed to initialize upload session", res.status);
      }

      const initResult = await res.json();
      sessionState = {
        sessionId: initResult.data.sessionId,
        fileName: file.name,
        fileSize,
        uploadedChunks: [],
      };

      await sessionStoreWrapper.setItem(storageKey, JSON.stringify(sessionState));
    }

    const { sessionId, uploadedChunks } = sessionState;

    // 5. Upload chunks
    const { accessToken } = sessionStore.getState();

    for (let index = 0; index < totalChunks; index++) {
      if (uploadedChunks.includes(index)) {
        // Skip already uploaded chunks
        onProgress(Math.round(((index + 1) / totalChunks) * 90)); // Save last 10% for assembly polling
        continue;
      }

      const start = index * base64ChunkSize;
      const end = Math.min(start + base64ChunkSize, base64Data.length);
      const chunkBase64 = base64Data.slice(start, end);

      const chunkUri = `data:application/octet-stream;base64,${chunkBase64}`;

      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("chunkIndex", String(index));
      formData.append("file", {
        uri: chunkUri,
        name: `chunk_${index}.bin`,
        type: "application/octet-stream",
      } as any);

      // Upload with retry + backoff
      let retries = 5;
      let delay = 1000;
      let uploadSuccess = false;

      while (retries > 0 && !uploadSuccess) {
        try {
          const res = await fetch(`${API_BASE_URL}/upload/chunk`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          });

          if (!res.ok) {
            const errPayload = await res.json().catch(() => ({}));
            throw new Error(errPayload.error?.message || `Chunk upload failed with ${res.status}`);
          }

          uploadSuccess = true;
        } catch (err) {
          retries--;
          console.warn(`[Chunked-Upload] Failed to upload chunk ${index}, retries left: ${retries}`, err);
          if (retries === 0) throw err;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }

      // Record successful chunk upload
      uploadedChunks.push(index);
      sessionState.uploadedChunks = uploadedChunks;
      await sessionStoreWrapper.setItem(storageKey, JSON.stringify(sessionState));

      // Report progress up to 90%
      const progressPercent = Math.round(((index + 1) / totalChunks) * 90);
      onProgress(progressPercent);
    }

    // 6. Complete upload
    const completeRes = await fetch(`${API_BASE_URL}/upload/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!completeRes.ok) {
      const errPayload = await completeRes.json().catch(() => ({}));
      throw new ApiError(errPayload.error?.code || "COMPLETE_FAILED", errPayload.error?.message || "Failed to trigger assembly", completeRes.status);
    }

    // 7. Poll status every 1.5 seconds until complete or failed
    let assembled = false;
    let pollAttempts = 0;
    const maxPollAttempts = 40; // 60 seconds timeout

    while (!assembled && pollAttempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      pollAttempts++;

      const statusRes = await fetch(`${API_BASE_URL}/upload/status/${sessionId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      if (!statusData.success) continue;

      const { status, file: fileRecord } = statusData.data;

      if (status === "completed") {
        assembled = true;
        await sessionStoreWrapper.deleteItem(storageKey); // Clean cache
        onProgress(100);
        onSuccess(fileRecord);
      } else if (status === "failed") {
        throw new Error("File assembly failed on the server.");
      } else {
        // Increment progress slightly while assembling
        const assemblyProgress = 90 + Math.min(9, Math.round((pollAttempts / maxPollAttempts) * 9));
        onProgress(assemblyProgress);
      }
    }

    if (!assembled) {
      throw new Error("Assembly timed out on the server. Please refresh to check status.");
    }
  } catch (err) {
    onError(err);
  }
}
