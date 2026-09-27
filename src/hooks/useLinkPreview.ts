import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string;
}

export function useLinkPreview(url: string | undefined) {
  return useQuery<LinkPreview | null>({
    queryKey: ["link-preview", url],
    enabled: !!url,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("link-preview", {
        body: { url },
      });
      if (error || data?.error) return null;
      return (data?.preview as LinkPreview | null) ?? null;
    },
  });
}
