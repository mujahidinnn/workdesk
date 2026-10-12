import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export function logClientError(
  source: string,
  message: string,
  context?: Record<string, Json>,
): void {
  supabase
    .rpc("log_client_error", {
      p_source: source,
      p_message: message,
      p_context: context ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("Error log write failed:", error.message);
    });
}
