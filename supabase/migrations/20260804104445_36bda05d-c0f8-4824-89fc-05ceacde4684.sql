CREATE TABLE public.auth_rate_limits (
  key text NOT NULL PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_limits TO service_role;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: this table is service-role/backend only.

CREATE INDEX idx_auth_rate_limits_window_start ON public.auth_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_sec integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamp with time zone := now();
  cutoff timestamp with time zone := now() - make_interval(secs => _window_seconds);
  rec public.auth_rate_limits%ROWTYPE;
BEGIN
  INSERT INTO public.auth_rate_limits AS arl (key, count, window_start, updated_at)
  VALUES (_key, 1, now_ts, now_ts)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN arl.window_start <= cutoff THEN 1 ELSE arl.count + 1 END,
        window_start = CASE WHEN arl.window_start <= cutoff THEN now_ts ELSE arl.window_start END,
        updated_at = now_ts
  RETURNING * INTO rec;

  IF rec.count > _limit THEN
    RETURN QUERY SELECT false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (rec.window_start + make_interval(secs => _window_seconds)) - now_ts))::integer);
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_rate_limits(_older_than_seconds integer DEFAULT 3600)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.auth_rate_limits
  WHERE window_start < now() - make_interval(secs => _older_than_seconds);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_rate_limits(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_rate_limits(integer) TO service_role;