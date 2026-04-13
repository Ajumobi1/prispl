
-- Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash all existing security answers in place
UPDATE public.profiles
SET security_answer = encode(digest(lower(trim(security_answer)), 'sha256'), 'hex')
WHERE security_answer != '' AND length(security_answer) != 64;

-- Fix 1: Restrict attachment deletion to uploader or admin
DROP POLICY "Approved users can delete attachments" ON public.task_attachments;

CREATE POLICY "Uploaders or admins can delete attachments"
  ON public.task_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Fix 2: Restrict profile self-update to only security_question and security_answer fields
DROP POLICY "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND username = (SELECT p.username FROM public.profiles p WHERE p.user_id = auth.uid())
    AND department = (SELECT p.department FROM public.profiles p WHERE p.user_id = auth.uid())
    AND status = (SELECT p.status FROM public.profiles p WHERE p.user_id = auth.uid())
    AND full_name = (SELECT p.full_name FROM public.profiles p WHERE p.user_id = auth.uid())
  );
