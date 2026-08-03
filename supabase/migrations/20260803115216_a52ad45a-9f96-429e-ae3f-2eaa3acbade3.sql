ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON public.tasks (deleted_at);

DROP POLICY IF EXISTS "Approved users can update tasks" ON public.tasks;

CREATE POLICY "Approved users can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (is_approved(auth.uid()))
WITH CHECK (is_approved(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_task_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     AND NOT (OLD.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'only the task creator or an admin can move a task to trash or restore it';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_task_soft_delete_trigger ON public.tasks;
CREATE TRIGGER guard_task_soft_delete_trigger
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_soft_delete();