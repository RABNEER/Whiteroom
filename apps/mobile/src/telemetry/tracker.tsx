import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "@/api/client";

interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
}

const MAX_BREADCRUMBS = 10;
const breadcrumbs: Breadcrumb[] = [];

/**
 * Record a user interaction or navigation event leading up to any potential crash.
 */
export function recordBreadcrumb(category: string, message: string) {
  breadcrumbs.push({
    timestamp: new Date().toISOString(),
    category,
    message,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

/**
 * Dispatches a client-side crash or unhandled error to the Whiteroom telemetry backend.
 */
export async function captureMobileError(
  error: Error | unknown,
  context: {
    screen?: string;
    isFatal?: boolean;
    level?: "critical" | "warning" | "info";
    extra?: Record<string, any>;
  } = {}
) {
  try {
    const errorObj =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : JSON.stringify(error));

    const appVersion =
      Constants.expoConfig?.version ||
      (Constants.manifest as any)?.version ||
      "0.0.1";

    const payload = {
      errorName: errorObj.name || (context.isFatal ? "FatalAppCrash" : "MobileClientError"),
      message: errorObj.message || "Unknown mobile exception",
      stack: errorObj.stack || "",
      screen: context.screen || "Mobile Client",
      appVersion,
      deviceInfo: {
        os: Platform.OS,
        version: String(Platform.Version),
        appVersion,
      },
      breadcrumbs: [...breadcrumbs],
      level: context.level || (context.isFatal ? "critical" : "warning"),
    };

    // Non-blocking fire-and-forget report
    api.reportError(payload).catch(() => {});
  } catch (loggingErr) {
    // Failsafe: logging should never throw
    console.warn("[telemetry] Failed to log mobile error:", loggingErr);
  }
}

/**
 * Initializes global JavaScript error handling for Android and iOS.
 */
export function initMobileCrashReporting() {
  const globalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();

  if ((global as any).ErrorUtils?.setGlobalHandler) {
    (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      console.error("📱 [CRASH-WATCHDOG] Unhandled mobile crash:", error);
      captureMobileError(error, { isFatal: !!isFatal, level: isFatal ? "critical" : "warning" });

      if (globalHandler) {
        globalHandler(error, isFatal);
      }
    });
  }

  recordBreadcrumb("lifecycle", "Mobile app crash reporting initialized");
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level React Error Boundary to catch render failures gracefully and alert Discord.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("📱 [ErrorBoundary] Caught UI component crash:", error, errorInfo);
    captureMobileError(error, {
      screen: "React Component Tree",
      isFatal: false,
      level: "critical",
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || "An unexpected error occurred in Whiteroom."}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleReset}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
