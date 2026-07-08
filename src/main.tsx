import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { toast } from "sonner";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { registerServiceWorker } from "./lib/registerSW";
import "./index.css";

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
