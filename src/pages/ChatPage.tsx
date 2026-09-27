import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { MembersPanel } from "@/components/chat/MembersPanel";
import { DmProfilePanel } from "@/components/chat/DmProfilePanel";
import { UserProfileModal } from "@/components/chat/UserProfileModal";
import { useAuth } from "@/context/auth";
import {
  useChatChannels,
  useChannelMembers,
  useStartDm,
} from "@/hooks/useChat";
import { useUsers } from "@/hooks/useUsers";

export default function ChatPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: channels = [] } = useChatChannels();
  const { data: users = [] } = useUsers();
  const startDm = useStartDm();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Mobile shows one pane; a ?channel= link opens straight into the chat.
  const [mobileChatOpen, setMobileChatOpen] = useState(
    searchParams.has("channel"),
  );
  const { sidebarHidden, toggleSidebar } = useOutletContext<{
    sidebarHidden: boolean;
    toggleSidebar: () => void;
  }>();

  // Trust ?channel= even before `channels` refetches (e.g. a new DM); falling back
  // to General would race that refetch. Only a missing param gets a default.
  const channelParam = searchParams.get("channel");
  const activeChannelId = channelParam
    ? Number(channelParam)
    : (channels.find((c) => c.type === "general")?.id ?? null);

  useEffect(() => {
    if (!channelParam && activeChannelId != null) {
      setSearchParams({ channel: String(activeChannelId) }, { replace: true });
    }
  }, [channelParam, activeChannelId, setSearchParams]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const members = useChannelMembers(activeChannel);
  const profileUser = users.find((u) => u.id === profileUserId) ?? null;
  const dmOtherUser =
    activeChannel?.type === "dm"
      ? (members.find((m) => m.id !== user?.id) ?? null)
      : null;

  if (!user) return null;

  function handleStartDm(otherUserId: string) {
    startDm.mutate(otherUserId, {
      onSuccess: (channelId) => {
        setSearchParams({ channel: String(channelId) });
        setMobileChatOpen(true);
      },
    });
  }

  return (
    <div className="flex h-full rounded-xl border border-border overflow-hidden bg-card">
      <ChatSidebar
        channels={channels}
        activeChannelId={activeChannelId}
        myUserId={user.id}
        users={users}
        onSelect={(id) => {
          setSearchParams({ channel: String(id) });
          setMobileChatOpen(true);
        }}
        mobileHidden={mobileChatOpen}
        onStartDm={handleStartDm}
        sidebarHidden={sidebarHidden}
        onToggleSidebar={toggleSidebar}
      />

      {activeChannel ? (
        <ChatWindow
          channel={activeChannel}
          members={members}
          onClickSender={setProfileUserId}
          onBack={() => setMobileChatOpen(false)}
          mobileHidden={!mobileChatOpen}
        />
      ) : (
        <div className="hidden md:block flex-1" />
      )}

      {dmOtherUser ? (
        <DmProfilePanel
          otherUser={dmOtherUser}
          onClickProfile={setProfileUserId}
        />
      ) : (
        <MembersPanel members={members} onClickMember={setProfileUserId} />
      )}

      <UserProfileModal
        user={profileUser}
        myUserId={user.id}
        open={profileUserId != null}
        onOpenChange={(v) => !v && setProfileUserId(null)}
        onMessage={(otherUserId) => {
          setProfileUserId(null);
          handleStartDm(otherUserId);
        }}
      />
    </div>
  );
}
