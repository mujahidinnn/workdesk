import { describe, expect, it } from "vitest";
import { parseAiText } from "../aiText";

describe("parseAiText", () => {
  it("renders bold and groups bullet lines into one list", () => {
    expect(parseAiText("Board **Website Revamp** tidak ditemukan.\n\nBoard lain:\n- Fleet\n* HRIS **baru**")).toEqual([
      { kind: "p", spans: [{ text: "Board ", bold: false }, { text: "Website Revamp", bold: true }, { text: " tidak ditemukan.", bold: false }] },
      { kind: "p", spans: [{ text: "Board lain:", bold: false }] },
      { kind: "ul", items: [[{ text: "Fleet", bold: false }], [{ text: "HRIS ", bold: false }, { text: "baru", bold: true }]] },
    ]);
  });

  it("groups numbered lines into an ordered list", () => {
    expect(parseAiText("Belum absen:\n1. **Andi** (Intern)\n2. Bima")).toEqual([
      { kind: "p", spans: [{ text: "Belum absen:", bold: false }] },
      { kind: "ol", items: [[{ text: "Andi", bold: true }, { text: " (Intern)", bold: false }], [{ text: "Bima", bold: false }]] },
    ]);
  });

  it("leaves unmatched asterisks as text", () => {
    expect(parseAiText("2 * 3 = **6")).toEqual([{ kind: "p", spans: [{ text: "2 * 3 = **6", bold: false }] }]);
  });
});
