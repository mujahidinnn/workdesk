import { describe, expect, it } from "vitest";
import { terbilang } from "@/lib/payslip";

describe("terbilang", () => {
  it("spells rupiah amounts in Indonesian", () => {
    expect(terbilang(0)).toBe("Nol Rupiah");
    expect(terbilang(11)).toBe("Sebelas Rupiah");
    expect(terbilang(115)).toBe("Seratus Lima Belas Rupiah");
    expect(terbilang(1000)).toBe("Seribu Rupiah");
    expect(terbilang(2500000)).toBe("Dua Juta Lima Ratus Ribu Rupiah");
    expect(terbilang(10930250)).toBe(
      "Sepuluh Juta Sembilan Ratus Tiga Puluh Ribu Dua Ratus Lima Puluh Rupiah",
    );
    expect(terbilang(1_000_000_000)).toBe("Satu Miliar Rupiah");
  });
});
