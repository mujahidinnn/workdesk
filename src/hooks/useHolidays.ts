import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import type { Holiday } from "@/lib/types";
import { estimateHolidays } from "@/lib/holidayEstimate";

const QK = ["holidays"] as const;

export function useHolidays() {
  return useQuery<Holiday[]>({
    queryKey: [...QK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_holidays")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data as Holiday[];
    },
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { date: string; name: string }) => {
      const { data, error } = await supabase
        .from("m_holidays")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("create", "holiday", data.id, {
        date: data.date,
        name: data.name,
      });
      toast.success("Holiday added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("m_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("delete", "holiday", id);
      toast.success("Holiday removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Covers Indonesia's full calendar (lunar holidays, cuti bersama), unlike
// generic holiday APIs such as Nager.Date.
const HOLIDAYS_SOURCE_URL =
  "https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/holidays.json";

type HolidaysJson = Record<string, { summary: string }>;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Marks computed rows as provisional until the official list replaces them. */
const ESTIMATE_SUFFIX = " (perkiraan)";

/** The official dataset only reaches about a year ahead; later years are
 *  estimated and saved with ESTIMATE_SUFFIX. */
export function useSyncNationalHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (year: number) => {
      const prefix = `${year}-`;
      let rows: { date: string; name: string; is_national: boolean }[] = [];
      try {
        const res = await fetch(HOLIDAYS_SOURCE_URL);
        if (res.ok) {
          const all = (await res.json()) as HolidaysJson;
          rows = Object.entries(all)
            .filter(([date]) => DATE_KEY.test(date) && date.startsWith(prefix))
            .map(([date, { summary }]) => ({ date, name: summary, is_national: true }));
        }
      } catch {
        // Offline or source down: the estimate below still works.
      }

      const estimated = rows.length === 0;
      if (estimated) {
        rows = estimateHolidays(year).map((h) => ({
          date: h.date,
          name: h.name + ESTIMATE_SUFFIX,
          is_national: true,
        }));
        // Two holidays can fall on one day; the table keeps one row per date.
        rows = rows.filter((r, i) => rows.findIndex((x) => x.date === r.date) === i);
      } else {
        // Official list replaces any estimate, including one that landed a day off.
        const { error } = await supabase
          .from("m_holidays")
          .delete()
          .like("name", `%${ESTIMATE_SUFFIX}`)
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`);
        if (error) throw error;
      }

      const { error } = await supabase
        .from("m_holidays")
        .upsert(rows, { onConflict: "date" });
      if (error) throw error;
      return { count: rows.length, estimated };
    },
    onSuccess: ({ count, estimated }, year) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "holiday", "sync", { year, count, estimated });
      toast.success(
        estimated
          ? `No official list for ${year} yet: added ${count} estimated holidays (may be a day off, no cuti bersama)`
          : `Synced ${count} national holidays for ${year}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
