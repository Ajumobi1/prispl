import { useEffect, useState } from "react";
import { WifiOff, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { drainOutbox, subscribeOutbox } from "@/lib/offlineOutbox";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const up = async () => {
      setOnline(true);
      // Try to flush the outbox as soon as we're back online.
      const { succeeded, failed } = await drainOutbox();
      if (succeeded > 0) {
        toast.success(
          `Synced ${succeeded} offline task${succeeded === 1 ? "" : "s"}.` +
            (failed > 0 ? ` ${failed} still pending.` : ""),
        );
      }
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const unsub = subscribeOutbox(setQueued);
    // Best-effort drain on mount in case we started online with leftover items.
    if (navigator.onLine) drainOutbox().catch(() => undefined);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      unsub();
    };
  }, []);

  if (online && queued === 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-amber-950 shadow"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        You are offline{queued > 0 ? ` — ${queued} task${queued === 1 ? "" : "s"} queued for sync` : " — showing cached content. Changes will not save until you reconnect."}.
      </div>
    );
  }

  // Online but still items queued (drain in progress or partial failure).
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-sky-500 px-4 py-1.5 text-xs font-medium text-sky-950 shadow"
    >
      <CloudUpload className="h-3.5 w-3.5" aria-hidden />
      Syncing {queued} queued task{queued === 1 ? "" : "s"}...
    </div>
  );
}
