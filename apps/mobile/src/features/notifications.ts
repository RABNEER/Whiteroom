import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/api/client";

export async function registerDeviceForNotifications() {
  const permissions = await Notifications.getPermissionsAsync();
  const finalPermissions =
    permissions.status === "granted"
      ? permissions
      : await Notifications.requestPermissionsAsync();

  if (finalPermissions.status !== "granted") {
    return { registered: false, reason: "permission-denied" as const };
  }

  const token = await Notifications.getDevicePushTokenAsync();
  await api.registerFcm({
    fcmToken: token.data,
    platform:
      Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
  });

  return { registered: true as const };
}
