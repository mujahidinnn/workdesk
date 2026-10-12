import { useEffect, useRef, useState, type ReactNode } from "react";

export function TopScrollbar({ children, className }: { children: ReactNode; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setWidth(el.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [children]);

  // Each side follows the other; equal values stop the echo.
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div
        ref={bar}
        onScroll={() => sync(bar.current, body.current)}
        className="shrink-0 overflow-x-auto overflow-y-hidden scrollbar-thin"
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div
        ref={body}
        onScroll={() => sync(body.current, bar.current)}
        className={`min-h-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
