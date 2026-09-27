import { describe, expect, it } from "vitest";
import { estimateHolidays } from "../holidayEstimate";

// The official 2026 dates (SKB 3 Menteri). Lunar estimates may be a day off.
const OFFICIAL_2026: Record<string, string> = {
  "Isra Mikraj Nabi Muhammad": "2026-01-16",
  "Tahun Baru Imlek": "2026-02-17",
  "Hari Suci Nyepi": "2026-03-19",
  "Hari Raya Idul Fitri": "2026-03-21",
  "Wafat Isa Almasih": "2026-04-03",
  "Hari Paskah": "2026-04-05",
  "Kenaikan Isa Almasih": "2026-05-14",
  "Hari Raya Idul Adha": "2026-05-27",
  "Hari Raya Waisak": "2026-05-31",
  "Tahun Baru Islam": "2026-06-16",
  "Maulid Nabi Muhammad": "2026-08-25",
};

const days = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

describe("estimateHolidays", () => {
  const list = estimateHolidays(2026);

  it("lands every holiday within a day of the official date", () => {
    for (const [name, date] of Object.entries(OFFICIAL_2026)) {
      const got = list.filter((h) => h.name === name).map((h) => h.date);
      expect(got.length, name).toBeGreaterThan(0);
      expect(Math.min(...got.map((g) => days(g, date))), name).toBeLessThanOrEqual(1);
    }
  });

  it("puts the Easter-based days exactly", () => {
    expect(list).toContainEqual({ date: "2026-04-05", name: "Hari Paskah" });
    expect(estimateHolidays(2031)).toContainEqual({ date: "2031-04-13", name: "Hari Paskah" });
  });

  it("covers years no official list has yet", () => {
    const names = new Set(estimateHolidays(2031).map((h) => h.name));
    for (const name of Object.keys(OFFICIAL_2026)) expect(names, name).toContain(name);
  });
});
