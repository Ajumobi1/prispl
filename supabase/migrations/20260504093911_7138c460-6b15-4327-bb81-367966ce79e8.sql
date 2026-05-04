CREATE POLICY "No updates allowed on task_attachments"
ON public.task_attachments
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);