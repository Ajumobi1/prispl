-- Lock down security_question and security_answer so they cannot be read by
-- any client role. Only the service role (used by edge functions) can access them.
-- RLS still applies to the rest of the row; this is column-level defense in depth.

REVOKE SELECT (security_question, security_answer) ON public.profiles FROM anon;
REVOKE SELECT (security_question, security_answer) ON public.profiles FROM authenticated;
REVOKE UPDATE (security_question, security_answer) ON public.profiles FROM anon;
REVOKE UPDATE (security_question, security_answer) ON public.profiles FROM authenticated;

-- Document the design decisions for the missing INSERT/DELETE policies.
COMMENT ON TABLE public.profiles IS
  'Profile rows are inserted exclusively by the handle_new_user() SECURITY DEFINER trigger on auth.users signup; no client INSERT policy is intentional. DELETEs are disallowed by design — accounts are locked/declined via status, never removed, to preserve task authorship history. security_question and security_answer columns are revoked from anon/authenticated; only the service role (edge functions) may read or write them, and security_answer is stored as a SHA-256 hash.';

COMMENT ON COLUMN public.profiles.security_answer IS
  'SHA-256 hash of the lowercased, trimmed security answer. Never stored in plain text. Column is revoked from client roles; only readable/writable via service role in edge functions (set-security-answer, reset-password-self).';

COMMENT ON COLUMN public.profiles.security_question IS
  'Security question prompt. Revoked from client roles; only the get-security-question edge function (service role) exposes it for the password recovery flow.';