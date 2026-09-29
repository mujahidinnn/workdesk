import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { useUsers } from "@/hooks/useUsers";
import { NOTIFICATIONS_QK } from "@/hooks/useNotifications";
import { subscribeShared } from "@/lib/realtimeSubscription";
import type {
  ChatChannel,
  ChatMessage,
  Project,
  Profile,
  UserWithEmail,
  ChatPayload,
} from "@/lib/types";

export interface ChatChannelRow extends ChatChannel {
  project: Pick<Project, "id" | "project_code" | "project_name"> | null;
  user_a: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  user_b: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

const CHANNELS_QK = ["chat-channels"] as const;
const ATTACHMENTS_BUCKET = "chat-attachments";
const SIGNED_URL_TTL = 60 * 60; // Bucket is private, so no public URLs.

/** RLS already scopes this to General, the caller's project channels and their DMs. */
export function useChatChannels() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<ChatChannelRow[]>({
    queryKey: CHANNELS_QK,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_chat_channels")
        .select(
          `
          *,
          project:m_projects(id, project_code, project_name),
          user_a:profiles!t_chat_channels_dm_user_a_fkey(id, full_name, avatar_url),
          user_b:profiles!t_chat_channels_dm_user_b_fkey(id, full_name, avatar_url)
        `,
        )
        .order("id", { ascending: true });
      if (error) throw error;
      return data as unknown as ChatChannelRow[];
    },
  });

  useEffect(() => {
    if (!user) return;
    // Shared channel: this hook mounts in several places at once, and Supabase
    // rejects a second `.on()` on an already-subscribed channel.
    return subscribeShared("chat-channels", (channel) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "t_chat_channels" },
        () => qc.invalidateQueries({ queryKey: CHANNELS_QK }),
      );
    });
  }, [user, qc]);

  return query;
}

// The FK is named explicitly: pinned_by is a second foreign key to
// profiles, so a bare "profiles" embed is ambiguous (PGRST201). "!inner" on
// attachments keeps only messages that have at least one.
function messageSelect(attachmentsOnly = false) {
  return `*, sender:profiles!t_chat_messages_sender_id_fkey(id, full_name, avatar_url), attachments:t_chat_attachments${attachmentsOnly ? "!inner" : ""}(id, file_path, file_name, file_type, file_size), reactions:t_chat_message_reactions(id, emoji, user_id), poll_votes:t_chat_poll_votes(user_id, option_idx, voter:profiles(id, full_name, avatar_url))`;
}

function messagesKey(channelId: number | null) {
  return ["chat-messages", channelId] as const;
}

/** Resolves a message's attachment rows to signed URLs (bucket is private) - same pattern as useTaskAttachments. */
async function withAttachmentUrls(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.attachments || m.attachments.length === 0) return m;
      const attachments = await Promise.all(
        m.attachments.map(async (a) => {
          // A leading "/" means a file shipped in public/ (demo seed), not a bucket object.
          if (a.file_path.startsWith("/")) return { ...a, url: a.file_path };
          const { data: signed } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .createSignedUrl(a.file_path, SIGNED_URL_TTL);
          return { ...a, url: signed?.signedUrl ?? null };
        }),
      );
      return { ...m, attachments };
    }),
  );
}

export function useChatMessages(channelId: number | null) {
  const qc = useQueryClient();

  const query = useQuery<ChatMessage[]>({
    queryKey: messagesKey(channelId),
    enabled: channelId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_chat_messages")
        .select(messageSelect())
        .eq("channel_id", channelId as number)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return withAttachmentUrls(data as unknown as ChatMessage[]);
    },
  });

  useEffect(() => {
    if (channelId == null) return;
    return subscribeShared(`chat-messages-${channelId}`, (channel) => {
      channel
        .on(
          // "*", not just INSERT: rows also change on edit and pin/unpin.
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "t_chat_messages",
            filter: `channel_id=eq.${channelId}`,
          },
          () => qc.invalidateQueries({ queryKey: messagesKey(channelId) }),
        )
        .on(
          // Realtime can't filter DELETE events, so listen unfiltered.
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "t_chat_messages" },
          () => qc.invalidateQueries({ queryKey: messagesKey(channelId) }),
        )
        .on(
          // Attachments land just after their message, so a message-INSERT
          // refetch can race ahead of them. No channel_id column to filter on.
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "t_chat_attachments" },
          () => qc.invalidateQueries({ queryKey: messagesKey(channelId) }),
        )
        .on(
          // Anyone can react, so listen to both events. Also unfilterable.
          "postgres_changes",
          { event: "*", schema: "public", table: "t_chat_message_reactions" },
          () => qc.invalidateQueries({ queryKey: messagesKey(channelId) }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "t_chat_poll_votes" },
          () => qc.invalidateQueries({ queryKey: messagesKey(channelId) }),
        );
    });
  }, [channelId, qc]);

  return query;
}

export interface ChatMessageSearch {
  text: string;
  filter: "all" | "attachments" | "pinned" | "mine";
  /** ISO timestamps, inclusive. */
  from: string | null;
  to: string | null;
}

/** Keyed under messagesKey so realtime invalidation refreshes search results too. */
export function useSearchChatMessages(
  channelId: number,
  search: ChatMessageSearch | null,
) {
  const { user } = useAuth();
  return useQuery<ChatMessage[]>({
    queryKey: [...messagesKey(channelId), "search", search],
    enabled: search != null,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { text, filter, from, to } = search as ChatMessageSearch;
      let q = supabase
        .from("t_chat_messages")
        .select(messageSelect(filter === "attachments"))
        .eq("channel_id", channelId);
      // Escape LIKE wildcards so "50%" matches literally.
      if (text) q = q.ilike("body", `%${text.replace(/[\\%_]/g, "\\$&")}%`);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      if (filter === "pinned") q = q.not("pinned_at", "is", null);
      if (filter === "mine") q = q.eq("sender_id", user?.id ?? "");
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return withAttachmentUrls((data as unknown as ChatMessage[]).reverse());
    },
  });
}

async function uploadAttachments(
  channelId: number,
  messageId: number,
  files: File[],
) {
  for (const file of files) {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()
      : undefined;
    const path = `${channelId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    const { error: uploadErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file);
    if (uploadErr) throw uploadErr;

    const { error: attErr } = await supabase.from("t_chat_attachments").insert({
      message_id: messageId,
      file_path: path,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
    });
    if (attErr) throw attErr;
  }
}

export function useSendChatMessage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      body,
      replyToId,
      mentions,
      mentionsEveryone,
      files,
      payload = null,
    }: {
      channelId: number;
      body: string;
      replyToId: number | null;
      mentions: string[];
      mentionsEveryone: boolean;
      files: File[];
      payload?: ChatPayload | null;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { data: inserted, error } = await supabase
        .from("t_chat_messages")
        .insert({
          channel_id: channelId,
          sender_id: user.id,
          body,
          reply_to_id: replyToId,
          mentions,
          mentions_everyone: mentionsEveryone,
          payload,
        })
        .select()
        .single();
      if (error) throw error;
      if (files.length > 0)
        await uploadAttachments(channelId, inserted.id, files);
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** Attachments are copied under the target channel's path, not referenced, since
 *  storage RLS is keyed off the channel id in the path. */
export function useForwardMessage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      message,
      toChannelId,
    }: {
      message: ChatMessage;
      toChannelId: number;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { data: inserted, error } = await supabase
        .from("t_chat_messages")
        .insert({
          channel_id: toChannelId,
          sender_id: user.id,
          body: message.body,
          mentions: [],
          forwarded_from_sender_name: message.sender?.full_name ?? "Unknown",
          payload: message.payload,
        })
        .select()
        .single();
      if (error) throw error;

      for (const att of message.attachments ?? []) {
        // App-shipped files (path starts with "/") are shared, not copied.
        let newPath = att.file_path;
        if (!att.file_path.startsWith("/")) {
          const ext = att.file_name.includes(".")
            ? att.file_name.split(".").pop()
            : undefined;
          newPath = `${toChannelId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
          const { error: copyErr } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .copy(att.file_path, newPath);
          if (copyErr) throw copyErr;
        }

        const { error: attErr } = await supabase
          .from("t_chat_attachments")
          .insert({
            message_id: inserted.id,
            file_path: newPath,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
          });
        if (attErr) throw attErr;
      }
    },
    onSuccess: (_data, { toChannelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(toChannelId) });
    },
  });
}

const UNREAD_QK = ["chat-unread-mentions"] as const;

/** channel_id -> unread count of @mentions, @everyone, or any DM from the other person. */
export function useUnreadMentionCounts() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<Record<number, number>>({
    queryKey: UNREAD_QK,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unread_mention_counts");
      if (error) throw error;
      const map: Record<number, number> = {};
      for (const row of data ?? [])
        map[row.channel_id] = Number(row.unread_count);
      return map;
    },
  });

  useEffect(() => {
    if (!user) return;
    return subscribeShared("chat-unread-mentions", (channel) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "t_chat_messages" },
        () => qc.invalidateQueries({ queryKey: UNREAD_QK }),
      );
    });
  }, [user, qc]);

  return query;
}

export interface ChatLastMessage {
  sender_id: string;
  sender_name: string | null;
  body: string | null;
  attachment_count: number;
  created_at: string;
}

const LAST_MESSAGES_QK = ["chat-last-messages"] as const;

export function useChatLastMessages() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<Record<number, ChatLastMessage>>({
    queryKey: LAST_MESSAGES_QK,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chat_last_messages");
      if (error) throw error;
      const map: Record<number, ChatLastMessage> = {};
      for (const { channel_id, ...row } of data ?? []) map[channel_id] = row;
      return map;
    },
  });

  useEffect(() => {
    if (!user) return;
    return subscribeShared("chat-last-messages", (channel) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "t_chat_messages" },
        () => qc.invalidateQueries({ queryKey: LAST_MESSAGES_QK }),
      );
    });
  }, [user, qc]);

  return query;
}

/** Marks a channel read up to now, which clears its unread-mention badge. */
export function useMarkChannelRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: number) => {
      if (!user) return;
      const { error } = await supabase.from("t_chat_channel_reads").upsert(
        {
          channel_id: channelId,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,user_id" },
      );
      if (error) throw error;
      // Keep the bell in sync: reading the channel reads its notifications.
      const { error: notifError } = await supabase
        .from("t_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("link", `/chat?channel=${channelId}`)
        .eq("is_read", false);
      if (notifError) throw notifError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNREAD_QK });
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_QK });
    },
  });
}

/** Toggles the caller's own reaction on a message - inserts if they haven't reacted with that emoji yet, deletes if they have. */
export function useToggleReaction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      channelId,
      emoji,
      reacted,
    }: {
      messageId: number;
      channelId: number;
      emoji: string;
      reacted: boolean;
    }) => {
      if (!user) throw new Error("Not signed in");
      if (reacted) {
        const { error } = await supabase
          .from("t_chat_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("t_chat_message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji });
        if (error) throw error;
      }
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** Server enforces single choice and option bounds; this just toggles. */
export function useToggleVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      option,
    }: {
      messageId: number;
      channelId: number;
      option: number;
    }) => {
      const { error } = await supabase.rpc("chat_toggle_vote", {
        p_message_id: messageId,
        p_option: option,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** Only the body is sent: the DB guard refuses other columns and stamps edited_at. */
export function useEditChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      body,
    }: {
      messageId: number;
      channelId: number;
      body: string;
    }) => {
      const { error } = await supabase
        .from("t_chat_messages")
        .update({ body })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** RLS only lets the sender delete. */
export function useDeleteChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
    }: {
      messageId: number;
      channelId: number;
    }) => {
      // Read paths first: attachment rows cascade away with the message.
      const { data: atts, error: attErr } = await supabase
        .from("t_chat_attachments")
        .select("file_path")
        .eq("message_id", messageId);
      if (attErr) throw attErr;

      const { error, count } = await supabase
        .from("t_chat_messages")
        .delete({ count: "exact" })
        .eq("id", messageId);
      if (error) throw error;
      if (!count) throw new Error("Message not deleted");

      // A failed cleanup only leaves an orphan file, so don't fail the delete.
      if (atts.length > 0) {
        const { error: rmErr } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .remove(atts.map((a) => a.file_path));
        if (rmErr) console.error("Chat attachment cleanup failed", rmErr);
      }
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** pinned_by and the timestamp are set by the DB guard. */
export function useTogglePinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      pinned,
    }: {
      messageId: number;
      channelId: number;
      pinned: boolean;
    }) => {
      const { error } = await supabase
        .from("t_chat_messages")
        .update({ pinned_at: pinned ? null : new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: (_data, { channelId }) => {
      qc.invalidateQueries({ queryKey: messagesKey(channelId) });
    },
  });
}

/** Gets (or lazily creates) the 1:1 DM channel with another user, then invalidates the channel list so it appears in the sidebar. */
export function useStartDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc("get_or_create_dm_channel", {
        p_other_user: otherUserId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANNELS_QK }),
  });
}

/** Admin-only; RLS enforces the admin and project-exists check. */
export function useCreateProjectThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      name,
    }: {
      projectId: number;
      name: string;
    }) => {
      const { error } = await supabase
        .from("t_chat_channels")
        .insert({ type: "project", project_id: projectId, name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANNELS_QK }),
  });
}

export function useProjectMemberIds(projectId: number | null) {
  return useQuery<string[]>({
    queryKey: ["project-members", projectId],
    enabled: projectId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_project_members")
        .select("user_id")
        .eq("project_id", projectId as number);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });
}

/** All users for General, assigned members for a project channel, both participants for a DM. */
export function useChannelMembers(
  channel: ChatChannelRow | null,
): UserWithEmail[] {
  const { data: allUsers = [] } = useUsers();
  const { data: projectMemberIds = [] } = useProjectMemberIds(
    channel?.type === "project" ? channel.project_id : null,
  );

  if (!channel) return [];
  if (channel.type === "general")
    return allUsers.filter((u) => !u.is_superadmin);
  if (channel.type === "project") {
    const ids = new Set(projectMemberIds);
    return allUsers.filter((u) => ids.has(u.id) && !u.is_superadmin);
  }
  const ids = new Set([channel.dm_user_a, channel.dm_user_b]);
  return allUsers.filter((u) => ids.has(u.id));
}
