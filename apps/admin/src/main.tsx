import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global real-time client error reporter for Admin Dashboard
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    try {
      fetch("/api/v1/telemetry/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorName: event.error?.name || "AdminWebError",
          message: event.message || "Unhandled error in Admin Dashboard",
          stack: event.error?.stack || "",
          screen: window.location.pathname,
          deviceInfo: {
            os: navigator.platform || "Browser",
            userAgent: navigator.userAgent,
          },
          level: "critical",
        }),
      }).catch(() => {});
    } catch {
      // Ignore failsafe
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event.reason;
      const errorObj = reason instanceof Error ? reason : new Error(String(reason));
      fetch("/api/v1/telemetry/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorName: errorObj.name || "AdminUnhandledPromiseRejection",
          message: errorObj.message || "Unhandled promise rejection in Admin Dashboard",
          stack: errorObj.stack || "",
          screen: window.location.pathname,
          deviceInfo: {
            os: navigator.platform || "Browser",
            userAgent: navigator.userAgent,
          },
          level: "warning",
        }),
      }).catch(() => {});
    } catch {
      // Ignore failsafe
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
