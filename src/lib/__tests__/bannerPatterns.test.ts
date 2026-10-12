import { expect, test } from "vitest";
import { PALETTES, PATTERNS, PRESETS, bannerChoice, bannerCss, isPatternValue, isStoredImage, patternValue, presetSrc } from "../bannerPatterns";

test("a stored pattern round-trips; anything else falls back to the seed default", () => {
  const v = patternValue({ pattern: "waves", palette: "grape" });
  expect(isPatternValue(v)).toBe(true);
  expect(bannerChoice(v, 1)).toEqual({ pattern: "waves", palette: "grape" });
  expect(isPatternValue("12/abc.jpg")).toBe(false);
  expect(bannerChoice("pattern:nope:grape", 5)).toEqual(bannerChoice(null, 5));
  expect(bannerChoice(null, 5)).toEqual(bannerChoice(undefined, 5));
  expect(bannerChoice(null, 5)).not.toEqual(bannerChoice(null, 6));
});

test("every pattern and palette renders a tile", () => {
  expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
  for (const p of PATTERNS) {
    for (const pal of PALETTES) {
      const css = bannerCss({ pattern: p.id, palette: pal.id });
      expect(css.endsWith(pal.colors[0])).toBe(true);
      const svg = decodeURIComponent(css.slice(css.indexOf(",") + 1, css.indexOf('")')));
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain('"');
      expect(svg).not.toContain("undefined");
    }
  }
});

test("presets map only to the shipped files; storage paths are the rest", () => {
  expect(presetSrc("preset:fleet")).toBe("/banners/fleet.svg");
  expect(presetSrc("preset:../../evil")).toBeUndefined();
  expect(presetSrc("12/a.jpg")).toBeUndefined();
  expect(PRESETS.length).toBeGreaterThanOrEqual(6);
  expect(isStoredImage("12/a.jpg")).toBe(true);
  expect(isStoredImage("preset:fleet")).toBe(false);
  expect(isStoredImage(patternValue({ pattern: "dots", palette: "ink" }))).toBe(false);
  expect(isStoredImage(null)).toBe(false);
});
