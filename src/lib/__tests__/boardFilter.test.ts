import { expect, test } from "vitest";
import { buildTaskTree } from "../taskTree";
import { filterFromParams, filterToParams, isFiltering, matchesFilter } from "../boardFilter";
import { row } from "./boardFixtures";

const today = new Date(2026, 9, 11);
const { byId } = buildTaskTree([
  row({ id: 1, title: "Notifikasi" }),
  row({
    id: 2,
    parent_id: 1,
    title: "Websocket",
    division_id: 3,
    due_date: "2026-10-09",
    assignees: [{ user_id: "u2", assigned_by: "u1" }],
  }),
  row({ id: 3, title: "Export RKP", due_date: "2026-10-15", labels: [{ label_id: 9 }] }),
]);

test("a card matches through any descendant", () => {
  expect(matchesFilter(byId.get(1)!, { q: "socket" }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", assignee: "u2" }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", division: 3 }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", assignee: "u2" }, today)).toBe(false);
});

test("task number, label and due filters", () => {
  expect(matchesFilter(byId.get(3)!, { q: "#3" }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", label: 9 }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", due: "overdue" }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", due: "overdue" }, today)).toBe(false);
  expect(matchesFilter(byId.get(3)!, { q: "", due: "week" }, today)).toBe(true);
});

test("isFiltering ignores blank search", () => {
  expect(isFiltering({ q: "  " })).toBe(false);
  expect(isFiltering({ q: "", label: 1 })).toBe(true);
});

test("the assignee filter also finds cards where the person owns a step", () => {
  const tree = buildTaskTree([row({ id: 9, steps: [{ id: 1, is_done: false, assignee_id: "u7" }] })]);
  expect(matchesFilter(tree.byId.get(9)!, { q: "", assignee: "u7" }, today)).toBe(true);
  expect(matchesFilter(tree.byId.get(9)!, { q: "", assignee: "u8" }, today)).toBe(false);
});

test("filters round-trip through the URL and junk is dropped", () => {
  const f = { q: "gps", assignee: "u2", division: 3, label: 9, due: "overdue" as const };
  const params = new URLSearchParams("task=12");
  filterToParams(f, params);
  expect(params.get("task")).toBe("12");
  expect(filterFromParams(params)).toEqual(f);
  filterToParams({ q: "" }, params);
  expect([...params.keys()]).toEqual(["task"]);
  expect(filterFromParams(new URLSearchParams("div=abc&due=soon&label=-1"))).toEqual({ q: "" });
});
