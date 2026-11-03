-- AI command bar: conversations, per-account daily quota, proposal claim, retention.
-- Browser clients never write messages; the edge function does that with the service role.

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.profiles
  ADD COLUMN ai_mode text NOT NULL DEFAULT 'ask' CHECK (ai_mode IN ('ask', 'auto'));

CREATE TABLE public.t_ai_conversations (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_ai_conversations_user_idx ON public.t_ai_conversations (user_id, updated_at DESC);
CREATE INDEX t_ai_conversations_updated_idx ON public.t_ai_conversations (updated_at);

CREATE TABLE public.t_ai_messages (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES public.t_ai_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_ai_messages_conv_idx ON public.t_ai_messages (conversation_id, id);

CREATE TABLE public.t_ai_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE public.m_ai_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  daily_limit int NOT NULL DEFAULT 30 CHECK (daily_limit BETWEEN 0 AND 1000)
);
INSERT INTO public.m_ai_settings (daily_limit) VALUES (30);

ALTER TABLE public.t_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conv_select ON public.t_ai_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_conv_delete ON public.t_ai_conversations FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_msg_select ON public.t_ai_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.t_ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY ai_settings_select ON public.m_ai_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_settings_update ON public.m_ai_settings FOR UPDATE TO authenticated
  USING (public.has_permission('master', 'update')) WITH CHECK (public.has_permission('master', 'update'));

REVOKE ALL ON public.t_ai_usage FROM anon, authenticated;
REVOKE ALL ON public.t_ai_conversations, public.t_ai_messages, public.m_ai_settings FROM anon, authenticated;
GRANT SELECT, DELETE ON public.t_ai_conversations TO authenticated;
GRANT SELECT ON public.t_ai_messages TO authenticated;
GRANT SELECT ON public.m_ai_settings TO authenticated;
GRANT UPDATE (daily_limit) ON public.m_ai_settings TO authenticated;

-- The quota day: the Jakarta calendar date of a moment, whatever the session time zone.
CREATE FUNCTION public.ai_day(ts timestamptz DEFAULT now()) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (ts AT TIME ZONE 'Asia/Jakarta')::date;
$$;

-- Remaining quota after counting this call. The day is the Jakarta date.
CREATE FUNCTION public.ai_consume_quota() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT daily_limit INTO v_limit FROM m_ai_settings;
  -- A missing settings row means no quota, same as 0.
  IF v_limit IS NULL OR v_limit <= 0 THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;
  INSERT INTO t_ai_usage AS u (user_id, day, count)
  VALUES (auth.uid(), ai_day(), 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1 WHERE u.count < v_limit
  RETURNING u.count INTO v_count;
  IF v_count IS NULL THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;
  RETURN v_limit - v_count;
END;
$$;

CREATE FUNCTION public.ai_quota_today() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'used', COALESCE((SELECT count FROM t_ai_usage
                       WHERE user_id = auth.uid() AND day = ai_day()), 0),
    'limit', (SELECT daily_limit FROM m_ai_settings));
$$;

-- Moves one proposal to a new status. The WHERE on the old status is the claim:
-- of two racing callers only one updates a row.
CREATE FUNCTION public.ai_set_proposal_status(p_message_id bigint, p_proposal_id text, p_status text,
                                              p_result jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev text;
  v_idx  int;
  v_patch jsonb;
BEGIN
  v_prev := CASE p_status
    WHEN 'executing' THEN 'pending'
    WHEN 'cancelled' THEN 'pending'
    WHEN 'executed'  THEN 'executing'
    WHEN 'failed'    THEN 'executing'
  END;
  IF v_prev IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  -- Results are small ids and summaries; cap them so a client cannot bloat the row.
  IF pg_column_size(p_result) > 8192 THEN
    RAISE EXCEPTION 'result_too_large';
  END IF;

  SELECT e.ord - 1 INTO v_idx
    FROM t_ai_messages m
    JOIN t_ai_conversations c ON c.id = m.conversation_id AND c.user_id = auth.uid()
    CROSS JOIN LATERAL jsonb_array_elements(m.content -> 'proposals') WITH ORDINALITY AS e(elem, ord)
   WHERE m.id = p_message_id AND e.elem ->> 'id' = p_proposal_id;
  IF v_idx IS NULL THEN
    RETURN false;
  END IF;

  v_patch := jsonb_build_object('status', p_status, 'status_at', now())
    || CASE WHEN p_status = 'failed' THEN jsonb_build_object('error', p_result ->> 'error')
            WHEN p_result IS NOT NULL THEN jsonb_build_object('result', p_result)
            ELSE '{}'::jsonb END;

  UPDATE t_ai_messages m
     SET content = jsonb_set(m.content, ARRAY['proposals', v_idx::text],
                             (m.content -> 'proposals' -> v_idx) || v_patch)
   WHERE m.id = p_message_id
     AND m.content -> 'proposals' -> v_idx ->> 'id' = p_proposal_id
     AND m.content -> 'proposals' -> v_idx ->> 'status' = v_prev
     AND EXISTS (SELECT 1 FROM t_ai_conversations c WHERE c.id = m.conversation_id AND c.user_id = auth.uid());
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_day(timestamptz), public.ai_consume_quota(), public.ai_quota_today(),
  public.ai_set_proposal_status(bigint, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_day(timestamptz), public.ai_consume_quota(), public.ai_quota_today(),
  public.ai_set_proposal_status(bigint, text, text, jsonb) TO authenticated;

-- 02:00 WIB daily.
SELECT cron.schedule('ai-retention', '0 19 * * *', $job$
  DELETE FROM public.t_ai_conversations WHERE updated_at < now() - interval '30 days';
  DELETE FROM public.t_ai_usage WHERE day < public.ai_day() - 7;
$job$);
