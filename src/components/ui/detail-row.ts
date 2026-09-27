import type { KeyboardEvent } from "react";

/** Makes a table row open its detail by mouse and keyboard (Tab + Enter/Space). */
export function detailRowProps(open: () => void) {
  return {
    onClick: open,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Only the row itself: Enter on a button inside must keep its own action.
      if (e.target !== e.currentTarget) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      open();
    },
  };
}
