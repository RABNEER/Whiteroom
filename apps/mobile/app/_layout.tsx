import { platformAlert } from "@/utils/alert";
import { useEffect } from "react";
import { Linking } from "react-native";
import Constants from "expo-constants";
import { Stack, router } from "expo-router";
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
import * as Notifications from "expo-notifications";
import { initMobileCrashReporting, ErrorBoundary } from "@/telemetry/tracker";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

initMobileCrashReporting();

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
                  if (
                    config.apkUrl &&
                    (config.apkUrl.startsWith("https://github.com/RABNEER/Whiteroom/releases/") ||
                      config.apkUrl.startsWith("https://apps.whiteroom.co.in/"))
                  ) {
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

    // ─── Deep Linking on Push Notification Tap ───
    const notificationSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response.notification.request.content.data as
            | Record<string, any>
            | undefined;
          if (!data) return;

          if (data.type === "chat" && data.roomId) {
            router.push({
              pathname: "/chat",
              params: { roomId: data.roomId, roomType: data.roomType || "classroom" },
            } as any);
          } else if (data.deepLink) {
            router.push(data.deepLink as any);
          } else if (data.type === "announcement") {
            router.push("/announcements" as any);
          } else if (data.type === "absence" || data.type === "reminder") {
            router.push("/attendance" as any);
          }
        } catch (err) {
          console.warn("[Notifications] Failed to handle notification response:", err);
        }
      });

    return () => {
      notificationSubscription.remove();
    };
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default RootLayout;
