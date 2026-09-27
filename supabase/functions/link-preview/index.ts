import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  // URL serializes v4-mapped as hex ([::ffff:7f00:1]), so match the whole
  // "::" prefix (unspecified, loopback, v4-mapped/compatible) plus NAT64.
  const v6 = ip.toLowerCase();
  return v6.startsWith("::") || v6.startsWith("64:ff9b:") || /^(fc|fd|fe[89ab])/.test(v6);
}

// ponytail: DNS is resolved separately from fetch(), so DNS rebinding can still slip through; pin the resolved IP if this ever fronts sensitive networks.
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Blocked host");
  }
  const isLiteral = host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const ips = isLiteral
    ? [host]
    : [
        ...(await Deno.resolveDns(host, "A").catch(() => [])),
        ...(await Deno.resolveDns(host, "AAAA").catch(() => [])),
      ];
  if (ips.length === 0 || ips.some(isPrivateIp)) throw new Error("Blocked host");
}

async function fetchHtml(input: string): Promise<{ html: string; finalUrl: URL } | null> {
  let url = new URL(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WorkDeskBot/1.0; +link-preview)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel();
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    return { html: new TextDecoder().decode(buf), finalUrl: url };
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseMeta(html: string): Record<string, string> {
  const head = html.split(/<\/head>/i)[0];
  const meta: Record<string, string> = {};
  for (const tag of head.matchAll(/<meta\s[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3];
    }
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = decodeEntities(attrs.content);
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title && !meta.title) meta.title = decodeEntities(title);
  return meta;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ error: "Invalid session" }, 401);

    const { url } = (await req.json()) as { url?: string };
    if (!url) return jsonResponse({ error: "url is required" }, 400);

    const page = await fetchHtml(url).catch(() => null);
    if (!page) return jsonResponse({ preview: null });

    const m = parseMeta(page.html);
    const title = m["og:title"] ?? m["twitter:title"] ?? m.title;
    const description = m["og:description"] ?? m["twitter:description"] ?? m.description;
    if (!title && !description) return jsonResponse({ preview: null });

    let image: string | null = null;
    const rawImage = m["og:image"] ?? m["twitter:image"];
    if (rawImage) {
      try {
        const u = new URL(rawImage, page.finalUrl);
        if (u.protocol === "http:" || u.protocol === "https:") image = u.href;
      } catch { /* ignore malformed image url */ }
    }

    return jsonResponse({
      preview: {
        url: page.finalUrl.href,
        title: title ?? null,
        description: description ?? null,
        image,
        siteName: m["og:site_name"] ?? page.finalUrl.hostname.replace(/^www\./, ""),
      },
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
