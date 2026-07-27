import { platformAlert } from "@/utils/alert";
import { useEffect } from "react";
import { Linking } from "react-native";
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
import * as Sentry from "@sentry/react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: false,
  tracesSampleRate: 1.0,
});

export { ErrorBoundary } from "expo-router";

function RootLayout() {
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
          "https://apps.whiteroom.co.in/api/v1";
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
          platformAlert(
            "New Update Required 🚀",
            `Whiteroom v${config.latestVersion} is now available. Please download and install the latest update to continue.`,
            [
              {
                text: "Download Update",
                onPress: () => {
                  if (config.apkUrl) {
                    Linking.openURL(config.apkUrl).catch(console.warn);
                  }
                },
              },
            ]
          );
        }
      } catch (err) {
        console.warn("APK version check failed:", err);
      }
    }

    async function onFetchUpdateAsync() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
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

export default Sentry.wrap(RootLayout);
