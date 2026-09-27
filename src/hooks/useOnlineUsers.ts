import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

let online = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Mount once (AppShell) so anyone signed in anywhere counts as online. */
export function useTrackPresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("online-users", {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        online = new Set(Object.keys(channel.presenceState()));
        emit();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({});
      });
    return () => {
      supabase.removeChannel(channel);
      online = new Set();
      emit();
    };
  }, [userId]);
}

export function useIsOnline(userId: string | undefined): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => !!userId && online.has(userId),
  );
}
