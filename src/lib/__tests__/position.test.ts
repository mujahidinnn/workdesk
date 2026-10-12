import { expect, test } from "vitest";
import { neighbourIds, positionBetween } from "../position";

test("positionBetween fills edges and gaps", () => {
  expect(positionBetween(null, null)).toBe(1024);
  expect(positionBetween(null, 1024)).toBe(0);
  expect(positionBetween(2048, null)).toBe(3072);
  expect(positionBetween(1024, 2048)).toBe(1536);
});

test("positionBetween keeps order through repeated inserts", () => {
  let after = 1024;
  for (let i = 0; i < 30; i++) {
    const p = positionBetween(0, after);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(after);
    after = p;
  }
});

test("neighbourIds reads both sides of the moved item", () => {
  expect(neighbourIds([7, 8, 9], 0)).toEqual({ beforeId: null, afterId: 8 });
  expect(neighbourIds([7, 8, 9], 1)).toEqual({ beforeId: 7, afterId: 9 });
  expect(neighbourIds([7, 8, 9], 2)).toEqual({ beforeId: 8, afterId: null });
  expect(neighbourIds([7], 0)).toEqual({ beforeId: null, afterId: null });
});
