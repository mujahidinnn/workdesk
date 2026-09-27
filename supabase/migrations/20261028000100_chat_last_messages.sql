CREATE OR REPLACE FUNCTION public.get_chat_last_messages()
RETURNS TABLE(channel_id integer, sender_id uuid, sender_name text, body text, attachment_count integer, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.id, m.sender_id, p.full_name, left(m.body, 200),
         (SELECT count(*)::int FROM t_chat_attachments a WHERE a.message_id = m.id),
         m.created_at
  FROM t_chat_channels c
  CROSS JOIN LATERAL (
    SELECT * FROM t_chat_messages x
    WHERE x.channel_id = c.id
    ORDER BY x.created_at DESC, x.id DESC
    LIMIT 1
  ) m
  LEFT JOIN profiles p ON p.id = m.sender_id
  WHERE public.chat_user_can_read(c.id, auth.uid());
$$;
