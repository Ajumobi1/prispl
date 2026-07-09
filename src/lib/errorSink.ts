import { supabase } from "@/integrations/supabase/client";

interface ReportInput {
  source: string;
  message: string;
  stack?: string;
  componentStack?: string;
  context?: Record<string, unknown>;
}

/**
 * Persist a client-side error to the `client_errors` table.
 * Fire-and-forget: swallows its own errors so it can never crash the app.
 */
export function reportClientError(input: ReportInput): void {
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("client_errors").insert({
        user_id: session?.user?.id ?? null,
        source: input.source,
        message: input.message?.slice(0, 2000) ?? "unknown",
        stack: input.stack?.slice(0, 8000) ?? null,
        component_stack: input.componentStack?.slice(0, 8000) ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        context: (input.context ?? null) as never,
      });
    } catch (err) {
      console.warn("[errorSink] failed to persist error:", err);
    }
  })();
}
