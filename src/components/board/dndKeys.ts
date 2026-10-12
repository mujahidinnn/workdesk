import type { UniqueIdentifier } from "@dnd-kit/core";

// Cards and columns share one DndContext, so their ids carry a kind prefix.
export const cardKey = (id: number) => `task-${id}`;
export const colKey = (id: number) => `col-${id}`;

export const parseKey = (k: UniqueIdentifier) => {
  const [kind, id] = String(k).split("-");
  return { kind: kind as "task" | "col", id: Number(id) };
};
