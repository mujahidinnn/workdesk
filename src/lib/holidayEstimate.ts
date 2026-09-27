/**
 * Indonesia's national holidays for a year no official list covers yet.
 *
 * The government fixes the religious dates (SKB 3 Menteri) about a year
 * ahead, so every published source stops at next year. Past that, the dates
 * are computed: fixed days, Easter by the Gregorian computus, Islamic days
 * from the Umm al-Qura calendar and Imlek/Nyepi/Waisak from the Chinese
 * lunisolar calendar, both built into Intl. Checked against the official
 * 2021-2027 lists, the lunar ones land on the day or one day off. Cuti
 * bersama cannot be computed at all, it is a yearly decree.
 */

/**
 * Indonesia's national holidays for a year no official list covers yet.
 *
 * The government fixes the religious dates (SKB 3 Menteri) about a year
 * ahead, so every published source stops at next year. Past that, the dates
 * are computed: fixed days, Easter by the Gregorian computus, Islamic days
 * from the Umm al-Qura calendar and Imlek/Nyepi/Waisak from the Chinese
 * lunisolar calendar, both built into Intl. Checked against the official
 * 2021-2027 lists, the lunar ones land on the day or one day off. Cuti
 * bersama cannot be computed at all, it is a yearly decree.
 */
export interface EstimatedHoliday {
  date: string;
  name: string;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function monthDay(fmt: Intl.DateTimeFormat, t: number) {
  const parts = fmt.formatToParts(new Date(t));
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = Number(parts.find((p) => p.type === "day")?.value);
  // A leap month formats as e.g. "4bis"; it never carries a holiday.
  return { month: /^\d+$/.test(month) ? Number(month) : -1, day };
}

/** Every date in `year` whose calendar month/day matches. */
function lunar(fmt: Intl.DateTimeFormat, year: number, month: number, day: number) {
  const out: string[] = [];
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += DAY) {
    const md = monthDay(fmt, t);
    if (md.month === month && md.day === day) out.push(iso(t));
  }
  return out;
}

/** Easter Sunday, anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}

export function estimateHolidays(year: number): EstimatedHoliday[] {
  const hijri = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    month: "numeric", day: "numeric", timeZone: "UTC",
  });
  const chinese = new Intl.DateTimeFormat("en-u-ca-chinese", {
    month: "numeric", day: "numeric", timeZone: "UTC",
  });
  const e = easter(year);
  const list: EstimatedHoliday[] = [];
  const add = (dates: string[], name: string) =>
    dates.forEach((date) => list.push({ date, name }));

  add([`${year}-01-01`], "Tahun Baru Masehi");
  add([`${year}-05-01`], "Hari Buruh Internasional");
  add([`${year}-06-01`], "Hari Lahir Pancasila");
  add([`${year}-08-17`], "Hari Proklamasi Kemerdekaan R.I.");
  add([`${year}-12-25`], "Hari Raya Natal");

  add([iso(e - 2 * DAY)], "Wafat Isa Almasih");
  add([iso(e)], "Hari Paskah");
  add([iso(e + 39 * DAY)], "Kenaikan Isa Almasih");

  add(lunar(hijri, year, 7, 27), "Isra Mikraj Nabi Muhammad");
  add(lunar(hijri, year, 10, 1), "Hari Raya Idul Fitri");
  add(lunar(hijri, year, 10, 2), "Hari Raya Idul Fitri");
  add(lunar(hijri, year, 12, 10), "Hari Raya Idul Adha");
  add(lunar(hijri, year, 1, 1), "Tahun Baru Islam");
  add(lunar(hijri, year, 3, 12), "Maulid Nabi Muhammad");

  add(lunar(chinese, year, 1, 1), "Tahun Baru Imlek");
  add(lunar(chinese, year, 4, 15), "Hari Raya Waisak");
  // Nyepi follows the new moon of the Saka month Kesanga, the first
  // lunar month to start on or after 1 March.
  for (let t = Date.UTC(year, 2, 1); t < Date.UTC(year, 4, 1); t += DAY) {
    if (monthDay(chinese, t).day === 1) {
      add([iso(t)], "Hari Suci Nyepi");
      break;
    }
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}
