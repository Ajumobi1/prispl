-- 1. Tighten storage delete policy on task-attachments
DROP POLICY IF EXISTS "Approved users can delete attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders or admins can delete attachments storage" ON storage.objects;

CREATE POLICY "Uploaders or admins can delete attachment files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.task_attachments ta
      WHERE ta.file_path = storage.objects.name
        AND ta.uploaded_by = auth.uid()
    )
  )
);

-- 2. Lock security_question/security_answer in profile self-update
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
  AND security_question = (SELECT p.security_question FROM public.profiles p WHERE p.user_id = auth.uid())
  AND security_answer = (SELECT p.security_answer FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 3. Performance indexes on tasks
CREATE INDEX IF NOT EXISTS idx_tasks_date_assigned ON public.tasks (date_assigned);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks (assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_unit ON public.tasks (unit);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON public.task_attachments (uploaded_by);