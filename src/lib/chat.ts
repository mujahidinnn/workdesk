import type { ChatChannelRow } from "@/hooks/useChat";
import type { ChatAttachment } from "@/lib/types";

export function isImageAttachment(a: ChatAttachment): boolean {
  return a.file_type?.startsWith("image/") ?? false;
}

export interface ChannelTitle {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  /** Set only for DM channels - the other participant, for the avatar + profile click. */
  otherUserId?: string;
}

export function channelTitle(
  channel: ChatChannelRow,
  myUserId: string,
): ChannelTitle {
  if (channel.type === "general") {
    return { name: "General", subtitle: "Everyone in WorkDesk" };
  }
  if (channel.type === "project") {
    return channel.name
      ? { name: channel.name, subtitle: channel.project?.project_name ?? "" }
      : {
          name: channel.project?.project_name ?? "Project",
          subtitle: channel.project?.project_code ?? "",
        };
  }
  const other =
    channel.dm_user_a === myUserId ? channel.user_b : channel.user_a;
  return {
    name: other?.full_name ?? "Direct Message",
    subtitle: "",
    avatarUrl: other?.avatar_url,
    otherUserId: other?.id,
  };
}

export interface MessagePart {
  text: string;
  kind: "text" | "mention" | "link";
  /** Set only for kind "link" - the actual href (protocol-prefixed even for bare "www." text). */
  href?: string;
}

const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)'"\]]+$/;

/** Splits plain text into "text" and "link" parts, trimming trailing sentence punctuation off a matched URL so "check example.com." doesn't swallow the period into the link. */
function splitLinks(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT_RE, "");
    if (trimmed.length === 0) continue;
    if (idx > lastIndex)
      parts.push({ text: text.slice(lastIndex, idx), kind: "text" });
    parts.push({
      text: trimmed,
      kind: "link",
      href: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    });
    lastIndex = idx + trimmed.length;
  }
  if (lastIndex < text.length)
    parts.push({ text: text.slice(lastIndex), kind: "text" });
  return parts;
}

/** Splits a message body into mention / link / plain-text parts for rendering. Mentions are matched against real channel member names (not guessed from arbitrary "@word" text); links are auto-detected http(s)/www URLs. */
export function messageParts(
  body: string,
  memberNames: string[],
  withEveryone = true,
): MessagePart[] {
  // "everyone" is a reserved broadcast mention, not a member name.
  const names = [
    ...memberNames.filter(Boolean),
    ...(withEveryone ? ["everyone"] : []),
  ].sort(
    (a, b) => b.length - a.length,
  );

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(?:${escaped.join("|")})`, "g");
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(...splitLinks(body.slice(lastIndex, idx)));
    parts.push({ text: match[0], kind: "mention" });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < body.length) parts.push(...splitLinks(body.slice(lastIndex)));
  return parts;
}
