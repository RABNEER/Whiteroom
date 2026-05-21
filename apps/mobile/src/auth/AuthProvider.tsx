import { ReactNode, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme/tokens";
import { useSession } from "./session-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrated = useSession((state) => state.hydrated);
  const hydrate = useSession((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
