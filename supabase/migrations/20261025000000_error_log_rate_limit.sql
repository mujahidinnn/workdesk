-- log_client_error is callable without a session (failed logins are logged
-- before anyone is signed in), so an anonymous script could fill t_error_log.
-- Cap it at 20 rows a minute per signed-in user, and 20 shared by all anon
-- callers.
-- ponytail: one shared anon bucket, so a flood also drops real failed-login
-- rows for that minute; key on the request IP if that matters.
CREATE OR REPLACE FUNCTION public.log_client_error(p_source text, p_message text, p_context jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT count(*) FROM t_error_log
       WHERE user_id IS NOT DISTINCT FROM auth.uid()
         AND created_at > NOW() - INTERVAL '1 minute') >= 20 THEN
    RETURN;
  END IF;

  INSERT INTO t_error_log (user_id, source, message, context)
  VALUES (
    auth.uid(),
    left(p_source, 64),
    left(p_message, 1000),
    CASE WHEN length(p_context::TEXT) <= 4000 THEN p_context END
  );
END;
$$;
