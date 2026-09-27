// Topographic contour lines as one SVG path. A height field (a few random
// hills and dips plus low-frequency ripples) is sampled on a grid and each
// level is traced with marching squares, so lines never cross or repeat.
// A fixed seed keeps the map the same on every load.

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Edges crossed per marching-squares case. Corner bits: TL=8 TR=4 BR=2 BL=1.
// Edges: 0 top, 1 right, 2 bottom, 3 left.
const CASES: number[][] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 1, 3, 2],
  [0, 2],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 3, 2, 1],
  [0, 1],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];

export function topoPath({
  w = 1600,
  h = 900,
  cell = 10,
  levels = 16,
  seed = 14,
} = {}) {
  const rand = mulberry32(seed);
  // Hills are stretched and rotated, and the sample point is warped, so no
  // contour closes into a clean circle.
  const hills = Array.from({ length: 10 }, () => {
    const a = rand() * Math.PI;
    const s = (0.06 + rand() * 0.1) * w;
    return {
      x: rand() * w,
      y: rand() * h,
      cos: Math.cos(a),
      sin: Math.sin(a),
      sx: s * (1.3 + rand() * 0.9),
      sy: s * (0.5 + rand() * 0.3),
      k: rand() < 0.3 ? -(0.3 + rand() * 0.4) : 0.4 + rand() * 0.8,
    };
  });
  const ripples = Array.from({ length: 6 }, () => ({
    fx: (rand() - 0.5) * 0.012,
    fy: (rand() - 0.5) * 0.012,
    p: rand() * Math.PI * 2,
  }));
  const warp = Array.from({ length: 4 }, () => ({
    f: 0.004 + rand() * 0.006,
    p: rand() * Math.PI * 2,
  }));
  const height = (x0: number, y0: number) => {
    const x =
      x0 +
      60 * Math.sin(warp[0].f * y0 + warp[0].p) +
      30 * Math.sin(warp[1].f * y0 + warp[1].p);
    const y =
      y0 +
      60 * Math.sin(warp[2].f * x0 + warp[2].p) +
      30 * Math.sin(warp[3].f * x0 + warp[3].p);
    return (
      hills.reduce((s, q) => {
        const u = (x - q.x) * q.cos + (y - q.y) * q.sin;
        const v = (y - q.y) * q.cos - (x - q.x) * q.sin;
        return (
          s +
          q.k *
            Math.exp(-(u * u) / (2 * q.sx * q.sx) - (v * v) / (2 * q.sy * q.sy))
        );
      }, 0) +
      0.12 *
        ripples.reduce((s, r) => s + Math.sin(r.fx * x + r.fy * y + r.p), 0)
    );
  };

  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const g = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = height(i * cell, j * cell);
      g[j * cols + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

  const r = (n: number) => Math.round(n * 10) / 10;
  let d = "";
  for (let l = 1; l <= levels; l++) {
    const t = min + ((max - min) * l) / (levels + 1);
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = g[j * cols + i];
        const b = g[j * cols + i + 1];
        const c = g[(j + 1) * cols + i + 1];
        const e = g[(j + 1) * cols + i];
        const edges =
          CASES[
            (a > t ? 8 : 0) |
              (b > t ? 4 : 0) |
              (c > t ? 2 : 0) |
              (e > t ? 1 : 0)
          ];
        if (!edges.length) continue;
        const x0 = i * cell;
        const y0 = j * cell;
        // Only called for crossed edges, whose ends sit on opposite sides of t.
        const pt = (edge: number) =>
          edge === 0
            ? [x0 + (cell * (t - a)) / (b - a), y0]
            : edge === 1
              ? [x0 + cell, y0 + (cell * (t - b)) / (c - b)]
              : edge === 2
                ? [x0 + (cell * (t - e)) / (c - e), y0 + cell]
                : [x0, y0 + (cell * (t - a)) / (e - a)];
        for (let k = 0; k < edges.length; k += 2) {
          const [x1, y1] = pt(edges[k]);
          const [x2, y2] = pt(edges[k + 1]);
          d += `M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}`;
        }
      }
  }
  return d;
}
