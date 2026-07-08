import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthProvider";
import { ApiProvider } from "@/api/query";
import { colors } from "@/theme/tokens";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import * as Updates from "expo-updates";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  useEffect(() => {
    async function onFetchUpdateAsync() {
      try {
        if (typeof Updates.checkForUpdateAsync !== "function") {
          return;
        }
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (error) {
        console.log("Error fetching latest Expo update:", error);
      }
    }

    if (!__DEV__ && Updates.isEnabled) {
      onFetchUpdateAsync();
    }
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ApiProvider>
        <AuthProvider>
          <StatusBar style="dark" backgroundColor={colors.paper} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.paper },
            }}
          />
        </AuthProvider>
      </ApiProvider>
    </SafeAreaProvider>
  );
}
