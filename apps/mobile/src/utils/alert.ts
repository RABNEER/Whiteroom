import { Alert, Platform, AlertButton } from "react-native";

/**
 * Cross-platform alert utility that safely falls back to window.alert on web
 * since React Native's Alert.alert throws an unhandled exception on web.
 */
export const platformAlert = (title: string, message?: string, options?: AlertButton[]) => {
  if (Platform.OS === "web") {
    window.alert(`${title}${message ? `\n\n${message}` : ""}`);
    // Web alert is blocking, so if there's an 'OK' option with an onPress, we should call it
    if (options && options.length > 0) {
      const defaultOption = options.find(o => o.style !== "cancel") || options[0];
      if (defaultOption && defaultOption.onPress) {
        defaultOption.onPress();
      }
    }
  } else {
    Alert.alert(title, message, options);
  }
};
