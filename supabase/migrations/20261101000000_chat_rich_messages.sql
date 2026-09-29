-- Structured chat messages: location, event (with RSVP) and poll. body keeps a
-- plain-text summary so previews, search and notifications work unchanged.
ALTER TABLE public.t_chat_messages
  ADD COLUMN payload jsonb,
  ADD CONSTRAINT t_chat_messages_payload_check CHECK (
    payload IS NULL
    OR payload->>'type' IN ('location', 'event')
    OR (payload->>'type' = 'poll'
        AND jsonb_typeof(payload->'options') = 'array'
        AND jsonb_array_length(payload->'options') BETWEEN 2 AND 12)
  );

-- Payload is fixed at send time; votes would point at the wrong options otherwise.
CREATE FUNCTION public.chat_message_payload_lock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.payload := OLD.payload;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chat_message_payload_lock BEFORE UPDATE ON public.t_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_message_payload_lock();

-- Poll votes, and event RSVPs (option 0 = going, 1 = not going).
CREATE TABLE public.t_chat_poll_votes (
    message_id bigint NOT NULL REFERENCES public.t_chat_messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    option_idx smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (message_id, user_id, option_idx)
);

ALTER TABLE public.t_chat_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_poll_votes_select ON public.t_chat_poll_votes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.t_chat_messages m
  WHERE ((m.id = t_chat_poll_votes.message_id) AND public.chat_user_can_read(m.channel_id, auth.uid())))));

-- Writes only go through this RPC, which validates the option and enforces
-- single choice unless the poll allows multiple answers.
CREATE FUNCTION public.chat_toggle_vote(p_message_id bigint, p_option smallint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payload jsonb;
  v_channel integer;
  v_count integer;
BEGIN
  SELECT payload, channel_id INTO v_payload, v_channel
  FROM t_chat_messages WHERE id = p_message_id;

  IF v_uid IS NULL OR v_channel IS NULL OR NOT public.chat_user_can_read(v_channel, v_uid) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  IF v_payload->>'type' NOT IN ('poll', 'event') THEN
    RAISE EXCEPTION 'Message is not votable';
  END IF;
  -- Events have two RSVP slots; polls have one per option.
  v_count := 2;
  IF v_payload->>'type' = 'poll' THEN
    v_count := jsonb_array_length(v_payload->'options');
  END IF;
  IF p_option < 0 OR p_option >= v_count THEN
    RAISE EXCEPTION 'Invalid option';
  END IF;

  DELETE FROM t_chat_poll_votes
  WHERE message_id = p_message_id AND user_id = v_uid AND option_idx = p_option;
  IF FOUND THEN
    RETURN;
  END IF;

  IF NOT COALESCE((v_payload->>'multi')::boolean, false) THEN
    DELETE FROM t_chat_poll_votes WHERE message_id = p_message_id AND user_id = v_uid;
  END IF;
  INSERT INTO t_chat_poll_votes (message_id, user_id, option_idx)
  VALUES (p_message_id, v_uid, p_option);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chat_toggle_vote(bigint, smallint) FROM PUBLIC, anon;

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_chat_poll_votes;
