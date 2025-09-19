interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function hexToRgb(hex: string): RgbColor {
  const cleaned = hex.replace(/^#/, "").trim();
  const normalized = cleaned.length === 3
    ? cleaned.split("").map((char) => char + char).join("")
    : cleaned;

  const int = parseInt(normalized, 16);
  if (Number.isNaN(int) || (normalized.length !== 6 && normalized.length !== 8)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (channel: number) => clampChannel(channel).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


function srgbToLinearChannel(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped <= 0.0031308) {
    return clamped * 12.92 * 255;
  }
  return (1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255;
}

export function lerpColorGamma(colorA: string, colorB: string, t: number): string {
  const clampedT = Math.min(1, Math.max(0, t));
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);

  const r = linearToSrgbChannel(
    srgbToLinearChannel(a.r) + (srgbToLinearChannel(b.r) - srgbToLinearChannel(a.r)) * clampedT,
  );
  const g = linearToSrgbChannel(
    srgbToLinearChannel(a.g) + (srgbToLinearChannel(b.g) - srgbToLinearChannel(a.g)) * clampedT,
  );
  const bChannel = linearToSrgbChannel(
    srgbToLinearChannel(a.b) + (srgbToLinearChannel(b.b) - srgbToLinearChannel(a.b)) * clampedT,
  );

  return rgbToHex({
    r: r,
    g: g,
    b: bChannel,
  });
}

export function mixColors(colorA: string, colorB: string, t: number): string {
  const clampedT = Math.min(1, Math.max(0, t));
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);

  return rgbToHex({
    r: a.r + (b.r - a.r) * clampedT,
    g: a.g + (b.g - a.g) * clampedT,
    b: a.b + (b.b - a.b) * clampedT,
  });
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${clampedAlpha})`;
}

export function ensureHex(color: string, fallback = "#000000"): string {
  if (!color) {
    return fallback;
  }

  const cleaned = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cleaned)) {
    return cleaned;
  }

  return fallback;
}
