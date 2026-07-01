
CREATE TABLE public.profile_recovery (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  security_question text NOT NULL DEFAULT '',
  security_answer text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.profile_recovery TO service_role;

ALTER TABLE public.profile_recovery ENABLE ROW LEVEL SECURITY;

-- No policies: no anon/authenticated access at all. Only service_role (edge
-- functions using SUPABASE_SERVICE_ROLE_KEY) may read or write this table.

COMMENT ON TABLE public.profile_recovery IS
  'Password-recovery security question and PBKDF2-hashed answer. Isolated from public.profiles so the hash is never returned to the account owner or admins via PostgREST. Read/written exclusively by set-security-answer, get-security-question, and reset-password-self edge functions.';

-- Backfill from existing profiles data
INSERT INTO public.profile_recovery (user_id, security_question, security_answer)
SELECT user_id, COALESCE(security_question, ''), COALESCE(security_answer, '')
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Rebuild self-update policy without the security_* lock rows (columns are gone)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND username = (SELECT p.username FROM public.profiles p WHERE p.user_id = auth.uid())
  AND department = (SELECT p.department FROM public.profiles p WHERE p.user_id = auth.uid())
  AND status = (SELECT p.status FROM public.profiles p WHERE p.user_id = auth.uid())
  AND full_name = (SELECT p.full_name FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Now drop the recovery columns from profiles entirely so the hash cannot
-- leak via SELECT * or any future policy widening.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS security_answer;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS security_question;

-- Update handle_new_user trigger to also seed an empty recovery row so
-- set-security-answer's UPDATE path works for brand-new accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, username, department, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Planning'),
    'pending'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.profile_recovery (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
