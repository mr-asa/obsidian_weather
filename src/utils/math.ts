export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return (value - min) / (max - min);
}

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) {
    return min;
  }
  return ((value - min) % range + range) % range + min;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
