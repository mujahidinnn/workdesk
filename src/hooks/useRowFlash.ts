import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const FLASH_CLASS = "ring-2 ring-inset ring-primary bg-primary/10 transition-colors duration-700";

const SETTLE_MS = 400;
const FLASH_MS = 3000;

/**
 * Scroll the row with data-row-id=id into view and flag it for a few seconds. `ready` = row is rendered.
 * Waits for the page transition and late layout shifts to settle first, and fires once per id.
 * `param` is the deep-link query key; it is dropped from the URL once used, so a refresh does not jump again.
 */
export function useRowFlash(id: string | null | undefined, ready: boolean, param?: string) {
  const [flash, setFlash] = useState<string | null>(null);
  const done = useRef<string | null>(null);
  const [, setParams] = useSearchParams();

  useEffect(() => {
    if (!id || !ready || done.current === id) return;
    const start = setTimeout(() => {
      const row = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
      if (!row) return;
      done.current = id;
      row.scrollIntoView({ block: "center" });
      setFlash(id);
      if (param) setParams((p) => { p.delete(param); return p; }, { replace: true });
    }, SETTLE_MS);
    return () => clearTimeout(start);
  }, [id, ready, param, setParams]);

  useEffect(() => {
    if (!flash) return;
    const end = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(end);
  }, [flash]);

  return flash;
}
