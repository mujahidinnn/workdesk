import { topoPath } from "./topo";

export interface Palette {
  id: string;
  colors: [string, string, string];
}

export const PALETTES: Palette[] = [
  { id: "forest", colors: ["#15803d", "#a3e635", "#14532d"] },
  { id: "grape", colors: ["#5b21b6", "#a78bfa", "#ede9fe"] },
  { id: "sunset", colors: ["#f59e0b", "#ea580c", "#fef3c7"] },
  { id: "bubblegum", colors: ["#f9a8d4", "#e11d48", "#fdf2f8"] },
  { id: "lagoon", colors: ["#134e4a", "#f0abfc", "#2dd4bf"] },
  { id: "lemon", colors: ["#fde047", "#dc2626", "#1f2937"] },
  { id: "sky", colors: ["#22d3ee", "#ef4444", "#ecfeff"] },
  { id: "bauhaus", colors: ["#fde8e0", "#0e7490", "#f97316"] },
  { id: "navy", colors: ["#1e3a8a", "#fbbf24", "#93c5fd"] },
  { id: "ink", colors: ["#111827", "#e5e7eb", "#6b7280"] },
];

interface Pattern {
  id: string;
  size: [number, number];
  cover?: boolean;
  draw: (a: string, b: string, c: string) => string;
}

const STROKE = (color: string, w: number) =>
  `fill='none' stroke='${color}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'`;

let topo: string | undefined;
const topography = () => (topo ??= topoPath({ w: 800, h: 240, cell: 10, levels: 12, seed: 7 }));

export const PATTERNS: Pattern[] = [
  {
    id: "topography",
    size: [800, 240],
    cover: true,
    draw: (_a, b) => `<path d='${topography()}' ${STROKE(b, 1.5)} stroke-opacity='0.8'/>`,
  },
  {
    id: "crosshatch",
    size: [16, 16],
    draw: (_a, b) => `<path d='M0 0 L16 16 M16 0 L0 16' ${STROKE(b, 1.5)}/>`,
  },
  {
    id: "circuit",
    size: [60, 60],
    draw: (_a, b, c) =>
      `<path d='M0 15 H20 L30 25 V45 H60 M40 0 V12 L48 20 H60 M15 60 V48 L5 38' ${STROKE(b, 2)}/><circle cx='30' cy='45' r='3' fill='${c}'/><circle cx='48' cy='20' r='3' fill='${c}'/><circle cx='5' cy='38' r='3' fill='${c}'/>`,
  },
  {
    id: "blobs",
    size: [90, 60],
    draw: (_a, b, c) =>
      `<path d='M14 10 C26 2 40 10 36 22 C32 34 12 34 8 24 C5 17 8 13 14 10 Z' fill='${b}'/><path d='M60 34 C72 28 86 36 82 46 C78 58 58 56 56 48 C54 42 55 37 60 34 Z' fill='${c}'/><circle cx='70' cy='12' r='4' fill='${b}'/><circle cx='30' cy='50' r='3' fill='${c}'/>`,
  },
  { id: "dots", size: [24, 24], draw: (_a, b) => `<circle cx='12' cy='12' r='5' fill='${b}'/>` },
  {
    id: "polka",
    size: [40, 40],
    draw: (_a, b, c) =>
      `<circle cx='10' cy='10' r='8' fill='${b}'/><circle cx='30' cy='30' r='8' fill='${b}'/><circle cx='30' cy='10' r='3' fill='${c}'/><circle cx='10' cy='30' r='3' fill='${c}'/>`,
  },
  {
    id: "checker",
    size: [32, 32],
    draw: (_a, b) => `<rect width='16' height='16' fill='${b}'/><rect x='16' y='16' width='16' height='16' fill='${b}'/>`,
  },
  {
    id: "stripes",
    size: [20, 20],
    draw: (_a, b) => `<path d='M-5 5 L5 -5 M0 20 L20 0 M15 25 L25 15' ${STROKE(b, 5)}/>`,
  },
  { id: "zigzag", size: [40, 20], draw: (_a, b) => `<path d='M0 15 L10 5 L20 15 L30 5 L40 15' ${STROKE(b, 4)}/>` },
  {
    id: "waves",
    size: [60, 24],
    draw: (_a, b) => `<path d='M0 12 C10 2 20 2 30 12 S50 22 60 12' ${STROKE(b, 4)}/>`,
  },
  {
    id: "grid",
    size: [24, 24],
    draw: (_a, b) => `<path d='M0 0.5 H24 M0.5 0 V24' ${STROKE(b, 1.5)}/>`,
  },
  {
    id: "diamonds",
    size: [32, 32],
    draw: (_a, b, c) => `<path d='M16 2 L30 16 L16 30 L2 16 Z' fill='${b}'/><circle cx='16' cy='16' r='4' fill='${c}'/>`,
  },
  {
    id: "triangles",
    size: [32, 28],
    draw: (_a, b, c) => `<path d='M0 28 L16 0 L32 28 Z' fill='${b}'/><path d='M12 28 L16 21 L20 28 Z' fill='${c}'/>`,
  },
  {
    id: "halfmoons",
    size: [48, 48],
    draw: (_a, b, c) =>
      `<path d='M0 24 A24 24 0 0 1 48 24 Z' fill='${b}'/><path d='M0 48 A24 24 0 0 1 24 24 L24 48 Z' fill='${c}'/><path d='M48 48 A24 24 0 0 0 24 24 L24 48 Z' fill='${c}'/>`,
  },
  {
    id: "scales",
    size: [40, 20],
    draw: (_a, b) =>
      `<path d='M0 20 A20 20 0 0 1 40 20 M-20 0 A20 20 0 0 1 20 0 M20 0 A20 20 0 0 1 60 0 M8 20 A12 12 0 0 1 32 20' ${STROKE(b, 2)}/>`,
  },
  {
    id: "plus",
    size: [28, 28],
    draw: (_a, b) => `<path d='M14 8 V20 M8 14 H20' ${STROKE(b, 4)}/>`,
  },
  {
    id: "rings",
    size: [40, 40],
    draw: (_a, b, c) => `<circle cx='20' cy='20' r='14' ${STROKE(b, 4)}/><circle cx='20' cy='20' r='5' fill='${c}'/>`,
  },
  {
    id: "hexagons",
    size: [42, 24],
    draw: (_a, b) => `<path d='M0 12 L7 0 H21 L28 12 L21 24 H7 Z M28 12 H42' ${STROKE(b, 2)}/>`,
  },
  {
    id: "herringbone",
    size: [32, 16],
    draw: (_a, b) => `<path d='M0 16 L16 0 M16 0 L32 16' ${STROKE(b, 4)}/>`,
  },
  {
    id: "squiggle",
    size: [80, 40],
    draw: (_a, b) => `<path d='M0 30 C15 30 15 10 30 10 S45 30 60 20 S75 5 80 10' ${STROKE(b, 5)}/>`,
  },
  {
    id: "confetti",
    size: [60, 60],
    draw: (_a, b, c) =>
      `<circle cx='10' cy='12' r='4' fill='${b}'/><path d='M38 8 L46 16' ${STROKE(c, 4)}/><path d='M20 40 L28 32 L36 40' ${STROKE(b, 3)}/><rect x='46' y='38' width='8' height='8' fill='${c}' transform='rotate(20 50 42)'/><circle cx='52' cy='54' r='2' fill='${b}'/>`,
  },
  {
    id: "sparkles",
    size: [36, 36],
    draw: (_a, b, c) =>
      `<path d='M18 6 Q20 16 30 18 Q20 20 18 30 Q16 20 6 18 Q16 16 18 6 Z' fill='${b}'/><circle cx='4' cy='4' r='1.5' fill='${c}'/>`,
  },
  {
    id: "bricks",
    size: [40, 20],
    draw: (_a, b) => `<path d='M0 0.5 H40 M0 10.5 H40 M10 0 V10 M30 10 V20' ${STROKE(b, 2)}/>`,
  },
  {
    id: "quarters",
    size: [40, 40],
    draw: (_a, b, c) =>
      `<path d='M0 0 H20 A20 20 0 0 1 0 20 Z' fill='${b}'/><path d='M40 40 H20 A20 20 0 0 1 40 20 Z' fill='${b}'/><path d='M40 0 V20 A20 20 0 0 1 20 0 Z' fill='${c}'/>`,
  },
  {
    id: "bars",
    size: [24, 24],
    draw: (_a, b, c) => `<rect x='2' width='8' height='24' fill='${b}'/><rect x='15' width='2' height='24' fill='${c}'/>`,
  },
  {
    id: "lattice",
    size: [32, 32],
    draw: (_a, b) => `<circle cx='0' cy='0' r='16' ${STROKE(b, 2)}/><circle cx='32' cy='0' r='16' ${STROKE(b, 2)}/><circle cx='0' cy='32' r='16' ${STROKE(b, 2)}/><circle cx='32' cy='32' r='16' ${STROKE(b, 2)}/><circle cx='16' cy='16' r='16' ${STROKE(b, 2)}/>`,
  },
  {
    id: "memphis",
    size: [72, 48],
    draw: (_a, b, c) =>
      `<path d='M6 40 L14 26 L22 40 Z' fill='${b}'/><circle cx='44' cy='12' r='6' ${STROKE(c, 3)}/><path d='M50 36 l6 -6 l6 6 l6 -6' ${STROKE(b, 3)}/><rect x='26' y='30' width='6' height='6' fill='${c}'/><path d='M8 6 h10' ${STROKE(c, 3)}/>`,
  },
  {
    id: "tiles",
    size: [48, 48],
    draw: (_a, b, c) =>
      `<rect x='4' y='4' width='18' height='18' rx='4' fill='${b}'/><rect x='26' y='26' width='18' height='18' rx='4' fill='${b}'/><rect x='30' y='8' width='10' height='10' rx='5' fill='${c}'/><rect x='8' y='30' width='10' height='10' rx='5' fill='${c}'/>`,
  },
];

export const PRESETS = ["fleet", "hris", "warehouse", "survey", "iot", "website", "analytics", "kanban", "support"].map((id) => ({
  id,
  src: `/banners/${id}.svg`,
}));

const PRESET_PREFIX = "preset:";

export const presetValue = (id: string) => `${PRESET_PREFIX}${id}`;

export function presetSrc(value: string | null | undefined): string | undefined {
  if (!value?.startsWith(PRESET_PREFIX)) return undefined;
  return PRESETS.find((p) => p.id === value.slice(PRESET_PREFIX.length))?.src;
}

export const isStoredImage = (v: string | null | undefined): v is string =>
  !!v && !v.startsWith(PRESET_PREFIX) && !v.startsWith("pattern:");

export interface BannerChoice {
  pattern: string;
  palette: string;
}

const PREFIX = "pattern:";

export const isPatternValue = (v: string | null | undefined): v is string => !!v?.startsWith(PREFIX);

export const patternValue = (c: BannerChoice) => `${PREFIX}${c.pattern}:${c.palette}`;

export function bannerChoice(value: string | null | undefined, seed: number): BannerChoice {
  if (isPatternValue(value)) {
    const [pattern, palette] = value.slice(PREFIX.length).split(":");
    if (PATTERNS.some((p) => p.id === pattern) && PALETTES.some((p) => p.id === palette)) return { pattern, palette };
  }
  const s = Math.abs(Math.trunc(seed));
  return { pattern: PATTERNS[s % PATTERNS.length].id, palette: PALETTES[(s * 7 + 3) % PALETTES.length].id };
}

export function bannerCss({ pattern, palette }: BannerChoice): string {
  const p = PATTERNS.find((x) => x.id === pattern) ?? PATTERNS[0];
  const [a, b, c] = (PALETTES.find((x) => x.id === palette) ?? PALETTES[0]).colors;
  const [w, h] = p.size;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>${p.draw(a, b, c)}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return p.cover ? `${url} center / cover no-repeat, ${a}` : `${url} 0 0 / ${w}px ${h}px repeat, ${a}`;
}
