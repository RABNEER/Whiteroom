import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import type { OTPVerifyResponse } from "@whiteroom/shared";

const ACCESS_TOKEN_KEY = "whiteroom.accessToken";
const REFRESH_TOKEN_KEY = "whiteroom.refreshToken";
const USER_KEY = "whiteroom.user";

type SessionUser = OTPVerifyResponse["user"];

const webMemoryStore = new Map<string, string>();

export const tokenStorage = {
  async getItem(key: string) {
    if (Platform.OS !== "web") {
      return SecureStore.getItemAsync(key);
    }

    try {
      return globalThis.localStorage?.getItem(key) ?? webMemoryStore.get(key) ?? null;
    } catch {
      return webMemoryStore.get(key) ?? null;
    }
  },
  async setItem(key: string, value: string) {
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    webMemoryStore.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Some embedded webviews disable localStorage; memory storage keeps the preview usable.
    }
  },
  async deleteItem(key: string) {
    if (Platform.OS !== "web") {
      await SecureStore.deleteItemAsync(key);
      return;
    }

    webMemoryStore.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore storage restrictions on web previews.
    }
  },
};

type SessionState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: OTPVerifyResponse) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  clear: () => Promise<void>;
};

export const sessionStore = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  async hydrate() {
    const [accessToken, refreshToken, userJson] = await Promise.all([
      tokenStorage.getItem(ACCESS_TOKEN_KEY),
      tokenStorage.getItem(REFRESH_TOKEN_KEY),
      tokenStorage.getItem(USER_KEY),
    ]);
    set({
      accessToken,
      refreshToken,
      user: userJson ? (JSON.parse(userJson) as SessionUser) : null,
      hydrated: true,
    });
  },
  async setSession(session) {
    await Promise.all([
      tokenStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken),
      tokenStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken),
      tokenStorage.setItem(USER_KEY, JSON.stringify(session.user)),
    ]);
    set({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    });
  },
  async setTokens(accessToken, refreshToken) {
    await Promise.all([
      tokenStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      tokenStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },
  async clear() {
    await Promise.all([
      tokenStorage.deleteItem(ACCESS_TOKEN_KEY),
      tokenStorage.deleteItem(REFRESH_TOKEN_KEY),
      tokenStorage.deleteItem(USER_KEY),
    ]);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));

export const useSession = sessionStore;
