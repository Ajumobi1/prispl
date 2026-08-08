DROP POLICY "Approved users can view tasks" ON public.tasks;

CREATE POLICY "Approved users can view tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  is_approved(auth.uid())
  AND (
    deleted_at IS NULL
    OR created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);