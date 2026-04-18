-- Column-level privilege lockdown: prevent ANY client (anon or authenticated, including admins)
-- from selecting the security_answer column. The service role used by edge functions
-- (reset-password-self, get-security-question) bypasses these grants and can still read it.
REVOKE SELECT (security_answer) ON public.profiles FROM anon, authenticated, PUBLIC;

-- Also prevent clients from overwriting the hashed answer directly via the table API.
-- Updates to security_answer must go through the registration / reset edge functions.
REVOKE UPDATE (security_answer) ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE INSERT (security_answer) ON public.profiles FROM anon, authenticated, PUBLIC;