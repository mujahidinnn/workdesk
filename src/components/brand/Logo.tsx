import { useId } from "react";
import { cn } from "@/lib/utils";

const VB = "0 0 40 22.5";
const WAVE =
  "M3.19 3.35C3.54 4.66 4.44 8.66 5.31 11.19C6.18 13.73 7.24 17.18 8.42 18.55C9.59 19.91 11.03 20.26 12.34 19.36C13.64 18.46 15.2 15.6 16.26 13.15C17.32 10.7 17.89 4.66 18.71 4.66C19.53 4.66 20.1 10.7 21.16 13.15C22.22 15.6 23.77 18.46 25.08 19.36C26.39 20.26 27.83 19.69 29 18.55C30.17 17.4 31.02 15.06 32.11 12.5C33.2 9.94 34.97 4.74 35.54 3.19";
const ARROW = "M27.41 9.77L35.54 3.19L36.81 13.57";
const BAND = 5.39;
const HOLE = 2.29;

/** `outline` is the real logo (masked hollow ribbon); `solid` is for favicon sizes where the 2px gap turns to mush. */
export function LogoMark({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "solid";
}) {
  const id = useId();
  const stroke = {
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <svg
      viewBox={VB}
      aria-hidden="true"
      className={cn("h-6 w-auto", className)}
    >
      {variant === "outline" ? (
        <>
          <mask id={id}>
            <g {...stroke} stroke="#fff" strokeWidth={BAND}>
              <path d={WAVE} />
              <path d={ARROW} strokeLinecap="butt" strokeLinejoin="miter" />
            </g>
            <g {...stroke} stroke="#000" strokeWidth={HOLE}>
              <path d={WAVE} />
              <path d={ARROW} strokeLinecap="butt" strokeLinejoin="miter" />
            </g>
          </mask>
          <rect
            width="100%"
            height="100%"
            fill="currentColor"
            mask={`url(#${id})`}
          />
        </>
      ) : (
        <g {...stroke} stroke="currentColor" strokeWidth={BAND}>
          <path d={WAVE} />
          <path d={ARROW} strokeLinecap="butt" strokeLinejoin="miter" />
        </g>
      )}
    </svg>
  );
}
