import { expect, test } from "vitest";
import { topoPath } from "../topo";

test("topoPath is stable per seed and stays in bounds", () => {
  const d = topoPath({ seed: 3 });
  expect(d).toBe(topoPath({ seed: 3 }));
  expect(d).not.toBe(topoPath({ seed: 4 }));
  const nums = d.match(/-?[\d.]+/g)!.map(Number);
  expect(nums.length).toBeGreaterThan(1000);
  expect(nums.every((n) => n >= 0 && n <= 1600)).toBe(true);
});
