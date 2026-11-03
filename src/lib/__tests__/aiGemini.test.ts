import { describe, it, expect } from "vitest";
import { toContents } from "../../../supabase/functions/ai-command/gemini";

describe("toContents", () => {
  it("merges repeated roles and drops empty turns so roles alternate", () => {
    const out = toContents([
      { role: "user", text: "first" },
      { role: "model", text: "" },
      { role: "user", text: "second" },
      { role: "model", text: "  " },
      { role: "model", calls: [{ name: "find_people", args: { query: "a" } }] },
      { role: "tool", results: [{ name: "find_people", response: { data: [] } }] },
      { role: "user", text: "third" },
    ]);
    expect(out.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(out[0].parts).toEqual([{ text: "first" }, { text: "second" }]);
    expect(out[2].parts).toHaveLength(2);
  });
});
