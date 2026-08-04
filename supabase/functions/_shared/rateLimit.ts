// Persisted rate limiter for edge functions.
//
// Counters live in public.auth_rate_limits and are incremented atomically by
// the public.consume_rate_limit RPC (SECURITY DEFINER, service_role only), so
// limits hold across isolates, concurrent instances and cold starts.
//
// Failure mode: FAIL-OPEN. If the RPC errors we log and allow the request —
// availability of password reset outweighs a brief gap during a DB hiccup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

let cachedClient: ReturnType<typeof createClient> | null = null;

function adminClient() {
  if (!cachedClient) {
    cachedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cachedClient;
}

export async function rateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const { data, error } = await adminClient().rpc("consume_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });

    if (error) {
      console.error("rate_limit_rpc_error", { key, message: error.message });
      return { ok: true, retryAfterSec: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") {
      console.error("rate_limit_rpc_unexpected_shape", { key, data });
      return { ok: true, retryAfterSec: 0 };
    }

    return { ok: row.allowed, retryAfterSec: row.retry_after_sec ?? 60 };
  } catch (err) {
    console.error("rate_limit_exception", { key, message: (err as Error).message });
    return { ok: true, retryAfterSec: 0 };
  }
}

/**
 * Build a rate-limit key from the caller IP plus an optional identifier
 * (the account being targeted). Including the identifier stops IP rotation
 * from dodging the limit and stops a botnet from brute-forcing one account.
 */
export function clientKey(req: Request, suffix = "", identifier?: string | null): string {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const parts = [suffix || "global", `ip:${ip}`];
  const id = typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
  if (id) parts.push(`id:${id.slice(0, 200)}`);
  return parts.join("|");
}

/** Key scoped to the targeted identifier only (IP-independent). */
export function identifierKey(suffix: string, identifier: string): string {
  return `${suffix}|id:${identifier.trim().toLowerCase().slice(0, 200)}`;
}

export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again shortly." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec || 60),
      },
    },
  );
}
