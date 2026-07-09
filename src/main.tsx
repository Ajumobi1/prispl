import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { toast } from "sonner";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { registerServiceWorker } from "./lib/registerSW";
import { reportClientError } from "./lib/errorSink";
import "./index.css";

// Capture uncaught errors and unhandled promise rejections into the backend sink.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportClientError({
      source: "window.error",
      message: event.message || "Uncaught error",
      stack: event.error?.stack,
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({
      source: "unhandledrejection",
      message: reason?.message ?? String(reason ?? "Unhandled rejection"),
      stack: reason?.stack,
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ErrorBoundary>
);

registerServiceWorker(() => {
  toast("A new version is available", {
    description: "Reload to get the latest updates.",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => window.location.reload(),
    },
  });
});
