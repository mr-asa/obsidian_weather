import { DEFAULT_SETTINGS, type TimeOfDayKey, type WeatherWidgetSettings } from "../settings";
import { ensureHex, lerpColorGamma, rgba } from "./color";
import { DEFAULT_ALPHA_EASING_PROFILE, createAlphaGradientCurve } from "./alpha-gradient";
import { clamp, lerp } from "./math";

const clamp01 = (value: number): number => {
  return clamp(value, 0, 1);
};

export interface GradientLayerInput {
  settings: WeatherWidgetSettings;
  baseColor: string;
  weatherColor: string;
  temperatureColor: string;
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
}

export interface GradientLayerResult {
  backgroundColor: string;
  weatherGradient: string;
  temperatureGradient: string;
  leftGradientEnd: number;
  rightGradientStart: number;
}

export function buildAlphaGradientLayer(
  color: string,
  curve: ReturnType<typeof createAlphaGradientCurve>,
  startFrac: number,
  endFrac: number,
  scale = 1,
  transform?: (value: number, position: number) => number,
  options: { clampToUnit?: boolean; includeUnitStops?: boolean } = {},
): string {
  const clampToUnit = options.clampToUnit ?? true;
  const includeUnitStops = options.includeUnitStops ?? clampToUnit;

  const rawStart = Math.min(startFrac, endFrac);
  const rawEnd = Math.max(startFrac, endFrac);

  const domainStart = clampToUnit ? clamp01(rawStart) : rawStart;
  const domainEnd = clampToUnit ? clamp01(rawEnd) : rawEnd;

  if (domainEnd <= domainStart) {
    const zero = rgba(color, 0);
    return `linear-gradient(90deg, ${zero} 0%, ${zero} 100%)`;
  }

  const range = domainEnd - domainStart;
  const samples = curve.sampleStops(128);
  const steps = Math.max(1, samples.length - 1);
  const clampedScale = clamp01(scale);
  const zero = rgba(color, 0);

  const stops: string[] = [];
  const formatPct = (value: number) => `${Math.round(value * 1000) / 10}%`;

  const pushStop = (position: number, alpha: number) => {
    stops.push(`${rgba(color, clamp01(alpha))} ${formatPct(position)}`);
  };

  pushStop(domainStart, 0);

  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const position = domainStart + range * t;
    const base = samples[Math.min(i, samples.length - 1)];
    const alphaBase = clamp01(base * clampedScale);
    const alpha = typeof transform === "function" ? transform(alphaBase, position) : alphaBase;
    pushStop(position, alpha);
  }

  pushStop(domainEnd, 0);

  if (includeUnitStops) {
    const hasZero = stops.some((stop) => stop.endsWith(" 0%"));
    const hasHundred = stops.some((stop) => stop.endsWith(" 100%"));
    if (!hasZero) {
      stops.unshift(`${zero} 0%`);
    }
    if (!hasHundred) {
      stops.push(`${zero} 100%`);
    }
  }

  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function computeDayLengthFraction(
  sunriseMinutes: number | null,
  sunsetMinutes: number | null,
): number {
  if (sunriseMinutes == null && sunsetMinutes == null) {
    return 0.5;
  }

  if (sunriseMinutes == null) {
    return 1;
  }

  if (sunsetMinutes == null) {
    return 0;
  }

  let span = sunsetMinutes - sunriseMinutes;
  if (span < 0) {
    span += 1_440;
  }

  return clamp01(span / 1_440);
}

export function gradientWidthScale(dayFraction: number): number {
  const clamped = clamp01(dayFraction);

  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    return lerp(0.8, 1, t);
  }

  const t = (clamped - 0.5) / 0.5;
  return lerp(1, 4 / 3, t);
}

export function computeGradientLayers(input: GradientLayerInput): GradientLayerResult {
  const dayFraction = computeDayLengthFraction(input.sunriseMinutes, input.sunsetMinutes);
  const widthScale = gradientWidthScale(dayFraction);
  const configuredPortion = typeof input.settings.gradientEdgePortion === "number"
    ? input.settings.gradientEdgePortion
    : DEFAULT_SETTINGS.gradientEdgePortion;
  const basePortion = clamp(configuredPortion, 0, 0.5);
  const gradientPortion = clamp01(basePortion * widthScale);

  const leftGradientEnd = gradientPortion;
  const rightGradientStart = clamp01(1 - gradientPortion);

  const weatherCurve = createAlphaGradientCurve(input.settings.weatherAlpha);
  const temperatureCurve = createAlphaGradientCurve(input.settings.temperatureAlpha);

  const weatherGradient = buildAlphaGradientLayer(input.weatherColor, weatherCurve, 0, leftGradientEnd);
  const temperatureGradient = buildAlphaGradientLayer(input.temperatureColor, temperatureCurve, rightGradientStart, 1);

  return {
    backgroundColor: input.baseColor,
    weatherGradient,
    temperatureGradient,
    leftGradientEnd,
    rightGradientStart,
  };
}

export function computeSunHighlight(settings: WeatherWidgetSettings, timeOfDay: TimeOfDayKey): number {
  if (timeOfDay === "night") {
    return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.nightHighlight);
  }

  if (timeOfDay === "day") {
    return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.dayHighlight);
  }

  return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.twilightHighlight);
}

export interface SunOverlayIconState {
  symbol: string;
  leftPercent: number;
  topPercent: number;
  scale: number;
  color: string;
  opacity: number;
}

export interface SunOverlayState {
  background: string;
  blendMode: string;
  icon: SunOverlayIconState;
  widthPercent: number;
  offsetPercent: number;
}

export interface SunOverlayInput {
  settings: WeatherWidgetSettings;
  nowMinutes: number;
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
  sunPositionPercent: number;
  timeOfDay: TimeOfDayKey;
}

export function buildSunOverlayState(input: SunOverlayInput): SunOverlayState {
  const { settings } = input;
  const sunLayer = settings.sunLayer;

  const gradientWidthPercent = typeof sunLayer.gradientWidthPercent === "number"
    ? sunLayer.gradientWidthPercent
    : sunLayer.width * 2;
  const sunHalfWidthPercent = clamp(gradientWidthPercent / 2, 0, 50);
  const sunHalfWidth = sunHalfWidthPercent / 100;
  const overflowFraction = clamp(sunLayer.gradientOverflowPercent ?? 50, 0, 200) / 100;
  const scaleFactor = 1 + overflowFraction * 2;
  const offsetFraction = overflowFraction;

  const dayColor = ensureHex(sunLayer.colors.day, "#FFD200");
  const sunriseColor = ensureHex(sunLayer.colors.sunrise, dayColor);
  const sunsetColor = ensureHex(sunLayer.colors.sunset, dayColor);
  const nightColor = ensureHex(sunLayer.colors.night, "#0f172a");

  let sunColor = dayColor;
  let alphaPeak = sunLayer.alphaDay.peak;
  let alphaMid = sunLayer.alphaDay.mid;
  let alphaLow = sunLayer.alphaDay.low;

  const transitions = sunLayer.transitions ?? DEFAULT_SETTINGS.sunLayer.transitions;
  const sunriseBefore = Math.max(0, transitions.sunrise.before);
  const sunriseAfter = Math.max(0, transitions.sunrise.after);
  const sunsetBefore = Math.max(0, transitions.sunset.before);
  const sunsetAfter = Math.max(0, transitions.sunset.after);

  const sunriseMinutes = input.sunriseMinutes;
  const sunsetMinutes = input.sunsetMinutes;
  const nowMinutes = input.nowMinutes;

  const hasSolarPath = sunriseMinutes != null && sunsetMinutes != null;
  const isNight = hasSolarPath
    ? nowMinutes < (sunriseMinutes ?? 0) || nowMinutes > (sunsetMinutes ?? 0)
    : input.timeOfDay === "night";

  if (hasSolarPath && sunriseMinutes != null && sunsetMinutes != null) {
    const sunsetWindowStart = Math.max(0, sunsetMinutes - sunsetBefore);
    const sunsetWindowEnd = Math.min(1_440, sunsetMinutes + sunsetAfter);
    const sunriseWindowEnd = sunriseMinutes + sunriseAfter;
    const beforeSunriseDistance = (sunriseMinutes - nowMinutes + 1_440) % 1_440;

    if (nowMinutes >= sunsetWindowStart && nowMinutes < sunsetMinutes) {
      const window = Math.max(1, sunsetBefore);
      const t = window === 0 ? 1 : 1 - (sunsetMinutes - nowMinutes) / window;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
      sunColor = lerpColorGamma(dayColor, sunsetColor, eased);
      alphaPeak = sunLayer.alphaDay.peak;
      alphaMid = sunLayer.alphaDay.mid;
      alphaLow = sunLayer.alphaDay.low;
    } else if (nowMinutes >= sunsetMinutes && nowMinutes <= sunsetWindowEnd) {
      const window = Math.max(1, sunsetAfter);
      const t = window === 0 ? 1 : (nowMinutes - sunsetMinutes) / window;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
      sunColor = lerpColorGamma(sunsetColor, nightColor, eased);
      alphaPeak = lerp(sunLayer.alphaDay.peak, sunLayer.alphaNight.peak, eased);
      alphaMid = lerp(sunLayer.alphaDay.mid, sunLayer.alphaNight.mid, eased);
      alphaLow = lerp(sunLayer.alphaDay.low, sunLayer.alphaNight.low, eased);
    } else if (beforeSunriseDistance <= sunriseBefore) {
      const window = Math.max(1, sunriseBefore);
      const t = window === 0 ? 1 : 1 - beforeSunriseDistance / window;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
      sunColor = lerpColorGamma(nightColor, sunriseColor, eased);
      alphaPeak = lerp(sunLayer.alphaNight.peak, sunLayer.alphaDay.peak, eased);
      alphaMid = lerp(sunLayer.alphaNight.mid, sunLayer.alphaDay.mid, eased);
      alphaLow = lerp(sunLayer.alphaNight.low, sunLayer.alphaDay.low, eased);
    } else if (sunriseAfter > 0 && nowMinutes >= sunriseMinutes && nowMinutes <= sunriseWindowEnd) {
      const window = Math.max(1, sunriseAfter);
      const t = window === 0 ? 1 : (nowMinutes - sunriseMinutes) / window;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
      sunColor = lerpColorGamma(sunriseColor, dayColor, eased);
      alphaPeak = sunLayer.alphaDay.peak;
      alphaMid = sunLayer.alphaDay.mid;
      alphaLow = sunLayer.alphaDay.low;
    } else if (isNight) {
      sunColor = nightColor;
      alphaPeak = sunLayer.alphaNight.peak;
      alphaMid = sunLayer.alphaNight.mid;
      alphaLow = sunLayer.alphaNight.low;
    } else {
      sunColor = dayColor;
      alphaPeak = sunLayer.alphaDay.peak;
      alphaMid = sunLayer.alphaDay.mid;
      alphaLow = sunLayer.alphaDay.low;
    }
  } else if (isNight) {
    sunColor = nightColor;
    alphaPeak = sunLayer.alphaNight.peak;
    alphaMid = sunLayer.alphaNight.mid;
    alphaLow = sunLayer.alphaNight.low;
  }

  const opacityScale = clamp01(sunLayer.gradientOpacity);
  alphaPeak = clamp01(alphaPeak * opacityScale);
  alphaMid = clamp01(alphaMid * opacityScale);
  alphaLow = clamp01(alphaLow * opacityScale);

  const centerFraction = clamp(input.sunPositionPercent / 100, 0, 1);
  const startVisible = centerFraction - sunHalfWidth;
  const endVisible = centerFraction + sunHalfWidth;
  const startFrac = (startVisible + offsetFraction) / scaleFactor;
  const endFrac = (endVisible + offsetFraction) / scaleFactor;

  const sunCurve = createAlphaGradientCurve({
    profile: sunLayer.alphaProfile ?? DEFAULT_ALPHA_EASING_PROFILE,
    innerOpacityRatio: clamp01(sunLayer.gradientInnerRatio ?? 0.5),
    opacityScale: 1,
  });

  const bezierTransform = (value: number) => {
    const t = clamp01(value);
    const oneMinusT = 1 - t;
    const bezier = (oneMinusT * oneMinusT * alphaLow)
      + (2 * oneMinusT * t * alphaMid)
      + (t * t * alphaPeak);
    return clamp01(bezier);
  };

  const sunGradient = endFrac > startFrac
    ? buildAlphaGradientLayer(
      sunColor,
      sunCurve,
      startFrac,
      endFrac,
      1,
      bezierTransform,
      { clampToUnit: false, includeUnitStops: false },
    )
    : `linear-gradient(90deg, transparent 0%, transparent 100%)`;

  const verticalFade = `linear-gradient(180deg,
    rgba(0,0,0,${settings.verticalFade.top}) 0%,
    rgba(0,0,0,${settings.verticalFade.middle}) 20%,
    rgba(0,0,0,${settings.verticalFade.middle}) 80%,
    rgba(0,0,0,${settings.verticalFade.top}) 100%)`;

  const sunSymbol = sunLayer.icon?.symbol?.trim() || DEFAULT_SETTINGS.sunLayer.icon.symbol;
  const iconScale = clamp(sunLayer.icon?.scale ?? DEFAULT_SETTINGS.sunLayer.icon.scale, 0.2, 4);

  const sunProgress = clamp01(centerFraction);
  const sunElevation = Math.sin(Math.PI * sunProgress);
  const horizonTop = 90;
  const zenithTop = 10;
  const iconTop = clamp(horizonTop - sunElevation * (horizonTop - zenithTop), zenithTop, horizonTop);

  const icon: SunOverlayIconState = {
    symbol: sunSymbol,
    leftPercent: clamp(((centerFraction + offsetFraction) / scaleFactor) * 100, 0, 100),
    topPercent: iconTop,
    scale: iconScale,
    color: sunColor,
    opacity: alphaPeak,
  };

  return {
    background: `${sunGradient}, ${verticalFade}`,
    blendMode: isNight ? "multiply, multiply" : "screen, normal",
    icon,
    widthPercent: scaleFactor * 100,
    offsetPercent: offsetFraction * 100,
  };
}
