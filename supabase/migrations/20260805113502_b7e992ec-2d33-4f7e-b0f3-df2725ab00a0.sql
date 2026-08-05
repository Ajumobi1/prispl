CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-expired-rate-limits');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge-expired-rate-limits',
  '15 3 * * *',
  $$SELECT public.purge_expired_rate_limits(3600);$$
);