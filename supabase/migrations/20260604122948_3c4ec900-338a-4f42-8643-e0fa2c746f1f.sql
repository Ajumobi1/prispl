
CREATE TABLE public.backup_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  kind TEXT NOT NULL,
  task_id UUID,
  attachment_id UUID,
  message TEXT NOT NULL,
  context JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.backup_failures TO authenticated;
GRANT ALL ON public.backup_failures TO service_role;

ALTER TABLE public.backup_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backup failures"
  ON public.backup_failures FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can log own backup failures"
  ON public.backup_failures FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can resolve backup failures"
  ON public.backup_failures FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_backup_failures_created_at ON public.backup_failures (created_at DESC);
CREATE INDEX idx_backup_failures_resolved ON public.backup_failures (resolved);
