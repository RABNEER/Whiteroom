import { ReactNode, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme/tokens";
import { useSession } from "./session-store";
import { registerDeviceForNotifications } from "@/features/notifications";

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrated = useSession((state) => state.hydrated);
  const hydrate = useSession((state) => state.hydrate);
  const accessToken = useSession((state) => state.accessToken);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && accessToken) {
      registerDeviceForNotifications().catch((err) => {
        console.error("Failed to register push notifications:", err);
      });
    }
  }, [hydrated, accessToken]);

  if (!hydrated) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.paper,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }

  return children;
}

import { useMutation } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { api } from "@/api/client";

export function useLogout() {
  const clearSession = useSession((s) => s.clear);
  
  return useMutation({
    mutationFn: async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.status === 'granted') {
          const token = await Notifications.getDevicePushTokenAsync();
          await api.logout(token.data);
        } else {
          await api.logout();
        }

        try {
          const messaging = require("@react-native-firebase/messaging");
          if (typeof messaging === "function") {
            await messaging().deleteToken();
          } else if (messaging && typeof messaging.default === "function") {
            await messaging.default().deleteToken();
          }
        } catch {
          // Ignored if Firebase Messaging is not installed
        }
      } catch (err) {
        console.error("Logout API failed, clearing session locally", err);
      } finally {
        await clearSession();
      }
    }
  });
}
