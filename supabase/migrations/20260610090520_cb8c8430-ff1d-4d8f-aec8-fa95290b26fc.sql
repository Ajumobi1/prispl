CREATE OR REPLACE FUNCTION public.prevent_duplicate_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  dup_id uuid;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO dup_id
  FROM public.tasks
  WHERE created_by = NEW.created_by
    AND task_title = NEW.task_title
    AND unit = NEW.unit
    AND date_assigned = NEW.date_assigned
    AND due_date = NEW.due_date
    AND created_at > now() - interval '10 seconds'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_task: an identical task was just created (id=%).', dup_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;