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
