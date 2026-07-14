import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import Constants from "expo-constants";
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

export { ErrorBoundary } from "expo-router";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  useEffect(() => {
    async function checkAPKUpdateAsync() {
      try {
        const apiBaseUrl =
          (Constants.expoConfig?.extra?.apiBaseUrl as string) ||
          "https://whiteroomapi-production-7011.up.railway.app/api/v1";
        const currentVersion = Constants.expoConfig?.version || "0.0.1";
        const response = await fetch(
          `${apiBaseUrl.replace(/\/v1$/, "")}/v1/app-version`
        );
        if (!response.ok) return;

        const config = await response.json();
        if (
          config?.latestVersion &&
          config.latestVersion !== currentVersion &&
          config.forceUpdate
        ) {
          Alert.alert(
            "New Update Required 🚀",
            `Whiteroom v${config.latestVersion} is now available. Please download and install the latest update to continue.`,
            [
              {
                text: "Download Update",
                onPress: () => {
                  if (config.apkUrl) {
                    Linking.openURL(config.apkUrl);
                  }
                },
              },
            ],
            { cancelable: false }
          );
        }
      } catch (error) {
        console.log("Error checking APK version:", error);
      }
    }

    async function onFetchUpdateAsync() {
      try {
        if (typeof Updates.checkForUpdateAsync !== "function") {
          return;
        }
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            "Update Available 🚀",
            "A new version of Whiteroom has been downloaded. Click Update Now to apply the latest improvements.",
            [
              {
                text: "Later",
                style: "cancel",
              },
              {
                text: "Update Now",
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ],
            { cancelable: false }
          );
        }
      } catch (error) {
        console.log("Error fetching latest Expo update:", error);
      }
    }

    checkAPKUpdateAsync();
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
