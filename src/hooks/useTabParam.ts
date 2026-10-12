import { useSearchParams } from "react-router-dom";

export function useTabParam<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const setTab = (next: T) =>
    setParams(
      (p) => {
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  return [tab, setTab] as const;
}
