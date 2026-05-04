REVOKE SELECT (security_answer, security_question) ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE INSERT (security_answer, security_question) ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE UPDATE (security_answer, security_question) ON public.profiles FROM anon, authenticated, PUBLIC;