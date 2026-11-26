/** Seeded spherical k-means: normalised centroids minimise cosine distance. */
export function clusterEmbeddings(vectors: number[][], opts: { clusters?: number; seed?: number; iterations?: number } = {}): number[] {
  if (!vectors.length) return [];
  const dimensions = vectors[0].length;
  const normalize = (v: number[]) => {
    if (!dimensions || v.length !== dimensions || v.some((x) => !Number.isFinite(x))) throw new Error("Invalid embedding dimensions or values.");
    const norm = Math.hypot(...v);
    if (!norm) throw new Error("Embeddings must have nonzero length.");
    return v.map((x) => x / norm);
  };
  const points = vectors.map(normalize);
  const k = Math.min(points.length, opts.clusters ?? Math.min(40, Math.max(1, Math.round(Math.sqrt(points.length)))));
  if (!Number.isInteger(k) || k < 1) throw new Error("Cluster count must be a positive integer.");
  const iterations = opts.iterations ?? 20;
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("Iterations must be a positive integer.");
  let seed = (opts.seed ?? 69) >>> 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const similarity = (a: number[], b: number[]) => {
    let dot = 0;
    for (let j = 0; j < dimensions; j++) dot += a[j] * b[j];
    return dot;
  };
  const centers = [points[Math.floor(random() * points.length)]];
  const distances = points.map(() => Infinity);
  // k-means++ gives separated starting centres; identical vectors need only one centre.
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      distances[i] = Math.min(distances[i], Math.max(0, 1 - similarity(points[i], last)) ** 2);
      sum += distances[i];
    }
    if (sum < 1e-12) break;
    let target = random() * sum;
    let next = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      target -= distances[i];
      if (target < 0) { next = i; break; }
    }
    centers.push(points[next]);
  }
  let assignments = points.map(() => -1);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = points.map((point) => {
      let best = 0;
      let score = -Infinity;
      for (let c = 0; c < centers.length; c++) {
        const s = similarity(point, centers[c]);
        if (s > score) { best = c; score = s; }
      }
      return best;
    });
    if (next.every((c, i) => c === assignments[i])) break;
    assignments = next;
    const sums = centers.map(() => Array<number>(dimensions).fill(0));
    for (let i = 0; i < points.length; i++) {
      const sum = sums[assignments[i]];
      for (let j = 0; j < dimensions; j++) sum[j] += points[i][j];
    }
    for (let c = 0; c < centers.length; c++) {
      const norm = Math.hypot(...sums[c]);
      if (norm) centers[c] = sums[c].map((x) => x / norm);
    }
  }
  return assignments;
}
