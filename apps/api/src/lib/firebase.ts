import { cert, getApps, initializeApp, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "./env.js";

/**
 * Initializes and retrieves the central Firebase Admin App instance.
 * Returns null if required credentials are not present.
 */
export function getFirebaseApp() {
  if (
    !env.FIREBASE_PROJECT_ID ||
    !env.FIREBASE_CLIENT_EMAIL ||
    !env.FIREBASE_PRIVATE_KEY
  ) {
    return null;
  }

  if (getApps().length === 0) {
    return initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }

  return getApp();
}

/**
 * Returns the Firebase Auth instance if configured.
 */
export function getFirebaseAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

/**
 * Returns the Firebase Messaging (FCM) instance if configured.
 */
export function getFirebaseMessaging() {
  const app = getFirebaseApp();
  return app ? getMessaging(app) : null;
}

/**
 * Verifies a Firebase client-side ID Token (JWT) cryptographically.
 * Returns the verified phone number.
 * Supports a local offline development bypass ("dev-bypass-[phone]") in development.
 */
export async function verifyFirebaseIdToken(token: string): Promise<{ phone: string; uid: string }> {
  // Development local bypass to avoid calling live network in offline dev builds
  // Requires both NODE_ENV strictly equal to development AND ENABLE_DEV_BYPASS explicitly set to "true"
  if (
    env.NODE_ENV === "development" &&
    env.ENABLE_DEV_BYPASS === "true" &&
    token.startsWith("dev-bypass-")
  ) {
    const phone = token.replace("dev-bypass-", "");
    console.log(`📱 [FIREBASE DEV BYPASS] Bypassing verification for: ${phone}`);
    return { phone, uid: `dev-uid-${phone}` };
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Admin SDK is not initialized. Please check your environment variables.");
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const phone = decodedToken.phone_number;
    if (!phone) {
      throw new Error("Firebase token verified successfully, but no phone_number claim was found.");
    }
    return { phone, uid: decodedToken.uid };
  } catch (error: any) {
    console.error("[FIREBASE AUTH ERROR] Verification failed:", error?.message || error);
    throw error;
  }
}
