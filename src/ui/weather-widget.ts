import type WeatherPlugin from "../main";
import {
  DEFAULT_SETTINGS,
  type TemperatureColorStop,
  type WeatherCategory,
  type WeatherWidgetSettings,
  type TimeOfDayKey,
  type CityLocation,
} from "../settings";
import { clamp } from "../utils/math";
import { ensureHex, lerpColorGamma } from "../utils/color";
import { buildSunOverlayState, computeGradientLayers } from "../utils/widget-render";
import { mergeCityLists } from "../utils/city";
import { computeSolarAltitude, timezoneOffsetFromIdentifier } from "../utils/solar";
import {
  createDateKey,
  extractDateComponents,
  formatDateComponents,
  normalizeDateFormat,
  type DateComponents,
  type MonthNameSet,
} from "../utils/date-format";
const MINUTES_IN_DAY = 1_440;
const MS_PER_MINUTE = 60_000;
const TIME_ICON_DEFAULTS: Record<TimeOfDayKey, string> = { ...DEFAULT_SETTINGS.timeIcons };

const WEATHER_FALLBACK_ICON = "☁";
type TimePaletteColor = string;
function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function easeCos(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
}
function getTimeOfDay(hour: number): TimeOfDayKey {
  if (hour >= 6 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "day";
  }

  if (hour >= 18 && hour < 22) {
    return "evening";
  }

  return "night";
}

function tempToColor(temperature: number | null | undefined, stops: TemperatureColorStop[]): string {
  if (temperature == null || Number.isNaN(temperature) || stops.length === 0) {
    return "#9ca3af";
  }

  const sorted = [...stops].sort((a, b) => a.temperature - b.temperature);

  if (temperature <= sorted[0].temperature) {
    return ensureHex(sorted[0].color, "#9ca3af");
  }

  if (temperature >= sorted[sorted.length - 1].temperature) {
    return ensureHex(sorted[sorted.length - 1].color, "#9ca3af");
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (temperature >= current.temperature && temperature <= next.temperature) {
      const factor = (temperature - current.temperature) / (next.temperature - current.temperature);
      return lerpColorGamma(ensureHex(current.color), ensureHex(next.color), factor);
    }
  }
  return ensureHex(sorted[0].color, "#9ca3af");
}

function wmoToCategory(code: number | null | undefined): WeatherCategory {
  const value = typeof code === "number" ? code : 2;
  if (value === 0 || value === 1) {
    return "sunny";
  }
  if (value === 2 || value === 3) {
    return "cloudy";
  }
  if (value === 45 || value === 48) {
    return "foggy";
  }
  if ([51, 53, 55, 56, 57].includes(value)) {
    return "drizzle";
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) {
    return "rainy";
  }
  if ([71, 73, 75, 77, 85, 86].includes(value)) {
    return "snowy";
  }
  if ([95, 96, 99].includes(value)) {
    return "storm";
  }
  return "cloudy";
}

function parseHmFromIsoLocal(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const match = /(T)(\d{2}):(\d{2})/.exec(iso);
  if (!match) {
    return null;
  }
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  return hours * 60 + minutes;
}

function minutesOfDayInTimezone(date: Date, timezone: string): number {
  try {
    const formatted = date.toLocaleTimeString(undefined, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [hour, minute] = formatted.split(":").map((part) => parseInt(part, 10));
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return hour * 60 + minute;
    }
  } catch (error) {
    console.warn("WeatherWidget: failed to format time in timezone", timezone, error);
  }
  return date.getHours() * 60 + date.getMinutes();
}

function clampOffsetByLon(lon: number): number {
  const offsetMinutes = Math.round(lon * 4);
  return Math.max(-12 * 60, Math.min(14 * 60, offsetMinutes));
}

function shiftedDateByOffset(date: Date, targetOffsetMin: number): Date {
  const localOffset = -date.getTimezoneOffset();
  const delta = targetOffsetMin - localOffset;
  return new Date(date.getTime() + delta * MS_PER_MINUTE);
}

function minutesOfDayAtLon(date: Date, lon: number): number {
  const shifted = shiftedDateByOffset(date, clampOffsetByLon(lon));
  return shifted.getHours() * 60 + shifted.getMinutes();
}

function minutesOfDayWithOffset(date: Date, offsetMinutes: number): number {
  const shifted = shiftedDateByOffset(date, offsetMinutes);
  return shifted.getHours() * 60 + shifted.getMinutes();
}

function resolveTimezoneOffsetMinutes(
  date: Date,
  timezone: string | null,
  explicitOffsetMinutes: number | null,
  longitude: number,
): number {
  if (typeof explicitOffsetMinutes === "number" && Number.isFinite(explicitOffsetMinutes)) {
    return explicitOffsetMinutes;
  }
  if (timezone) {
    const resolved = timezoneOffsetFromIdentifier(date, timezone);
    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      return resolved;
    }
  }
  const fallback = clampOffsetByLon(longitude);
  if (Number.isFinite(fallback)) {
    return fallback;
  }
  return -date.getTimezoneOffset();
}

function formatTimeForCity(
  date: Date,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
  locale: string,
): string {
  if (timezone) {
    try {
      return date.toLocaleTimeString(locale, {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (error) {
      console.warn("WeatherWidget: failed to format time with timezone", timezone, error);
    }
  }
  if (typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)) {
    const shifted = shiftedDateByOffset(date, timezoneOffsetMinutes);
    return shifted.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const shifted = shiftedDateByOffset(date, clampOffsetByLon(longitude));
  return shifted.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resolveCityDateComponents(
  date: Date,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
): DateComponents {
  let targetOffset: number | null = null;
  if (typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)) {
    targetOffset = timezoneOffsetMinutes;
  }
  if (targetOffset == null && timezone) {
    const resolved = timezoneOffsetFromIdentifier(date, timezone);
    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      targetOffset = resolved;
    }
  }
  if (targetOffset == null) {
    targetOffset = clampOffsetByLon(longitude);
  }
  const shifted = shiftedDateByOffset(date, targetOffset);
  return extractDateComponents(shifted);
}

function formatDateForCity(
  date: Date,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
  formatPattern: string,
  monthNames?: MonthNameSet,
): { label: string; key: string } {
  const components = resolveCityDateComponents(date, timezone, timezoneOffsetMinutes, longitude);
  const normalizedFormat = normalizeDateFormat(formatPattern, DEFAULT_SETTINGS.dateFormat);
  const label = formatDateComponents(
    components,
    normalizedFormat,
    DEFAULT_SETTINGS.dateFormat,
    monthNames,
  );
  return {
    label,
    key: createDateKey(components),
  };
}

function sunPositionPercent(
  sunriseIso: string | null,
  sunsetIso: string | null,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
): number {
  const sunrise = parseHmFromIsoLocal(sunriseIso);
  const sunset = parseHmFromIsoLocal(sunsetIso);
  if (sunrise == null || sunset == null || sunset <= sunrise) {
    return 0;
  }
  const now = new Date();
  const minutesNow = timezone
    ? minutesOfDayInTimezone(now, timezone)
    : typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)
      ? minutesOfDayWithOffset(now, timezoneOffsetMinutes)
      : minutesOfDayAtLon(now, longitude);
  if (minutesNow <= sunrise) {
    return 0;
  }
  if (minutesNow >= sunset) {
    return 100;
  }
  return ((minutesNow - sunrise) / (sunset - sunrise)) * 100;
}

export interface TimePhaseColor {
  color: TimePaletteColor;
  phase: TimeOfDayKey;
  nextPhase: TimeOfDayKey;
  blend: number;
}

export function resolveTimePhaseColor(
  settings: WeatherWidgetSettings,
  sunriseIso: string | null,
  sunsetIso: string | null,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
  nowMinutesOverride?: number,
): TimePhaseColor {
  const sunriseMinutes = parseHmFromIsoLocal(sunriseIso);
  const sunsetMinutes = parseHmFromIsoLocal(sunsetIso);
  let nowMinutes: number;
  if (typeof nowMinutesOverride === "number" && Number.isFinite(nowMinutesOverride)) {
    nowMinutes = clamp(nowMinutesOverride, 0, MINUTES_IN_DAY - 1);
  } else {
    const now = new Date();
    nowMinutes = timezone
      ? minutesOfDayInTimezone(now, timezone)
      : typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)
        ? minutesOfDayWithOffset(now, timezoneOffsetMinutes)
        : minutesOfDayAtLon(now, longitude);
  }
  if (sunriseMinutes == null || sunsetMinutes == null || sunsetMinutes <= sunriseMinutes) {
    const tod = getTimeOfDay(Math.floor(nowMinutes / 60));
    const base = ensureHex(settings.timeBaseColors[tod]);
    return {
      phase: tod,
      nextPhase: tod,
      blend: 0,
      color: base,
    };
  }
  const transitions = settings.timeColorTransitions ?? DEFAULT_SETTINGS.timeColorTransitions;
  const sunriseBefore = Math.max(0, transitions.sunrise.before);
  const sunriseAfter = Math.max(0, transitions.sunrise.after);
  const sunsetBefore = Math.max(0, transitions.sunset.before);
  const sunsetAfter = Math.max(0, transitions.sunset.after);

  const colors = {
    night: ensureHex(settings.timeBaseColors.night),
    morning: ensureHex(settings.timeBaseColors.morning),
    day: ensureHex(settings.timeBaseColors.day),
    evening: ensureHex(settings.timeBaseColors.evening),
  };

  const minutesAfterSunset = nowMinutes - sunsetMinutes;
  if (minutesAfterSunset >= 0) {
    if (sunsetAfter > 0 && minutesAfterSunset <= sunsetAfter) {
      const span = Math.max(1, sunsetAfter);
      const t = clamp01(minutesAfterSunset / span);
      const eased = easeCos(t);
      const dominant = eased < 0.5 ? "evening" : "night";
      return {
        phase: dominant,
        nextPhase: "night",
        blend: eased,
        color: lerpColorGamma(colors.evening, colors.night, eased),
      };
    }
    return {
      phase: "night",
      nextPhase: "night",
      blend: 0,
      color: colors.night,
    };
  }

  const minutesBeforeSunset = sunsetMinutes - nowMinutes;
  if (sunsetBefore > 0 && minutesBeforeSunset <= sunsetBefore) {
    const span = Math.max(1, sunsetBefore);
    const normalized = clamp01(1 - minutesBeforeSunset / span);
    const eased = easeCos(normalized);
    const dominant = eased < 0.5 ? "day" : "evening";
    return {
      phase: dominant,
      nextPhase: "evening",
      blend: eased,
      color: lerpColorGamma(colors.day, colors.evening, eased),
    };
  }

  const minutesAfterSunrise = nowMinutes - sunriseMinutes;
  if (minutesAfterSunrise >= 0) {
    if (sunriseAfter > 0 && minutesAfterSunrise <= sunriseAfter) {
      const span = Math.max(1, sunriseAfter);
      const t = clamp01(minutesAfterSunrise / span);
      const eased = easeCos(t);
      const dominant = eased < 0.5 ? "morning" : "day";
      return {
        phase: dominant,
        nextPhase: "day",
        blend: eased,
        color: lerpColorGamma(colors.morning, colors.day, eased),
      };
    }
    return {
      phase: "day",
      nextPhase: "day",
      blend: 0,
      color: colors.day,
    };
  }

  const minutesBeforeSunrise = sunriseMinutes - nowMinutes;
  if (sunriseBefore > 0 && minutesBeforeSunrise <= sunriseBefore) {
    const span = Math.max(1, sunriseBefore);
    const normalized = clamp01(1 - minutesBeforeSunrise / span);
    const eased = easeCos(normalized);
    const dominant = eased < 0.5 ? "night" : "morning";
    return {
      phase: dominant,
      nextPhase: "morning",
      blend: eased,
      color: lerpColorGamma(colors.night, colors.morning, eased),
    };
  }

  return {
    phase: "night",
    nextPhase: "night",
    blend: 0,
    color: colors.night,
  };
}
const ROW_HEIGHT_MIN_PX = 24;
const ROW_HEIGHT_MAX_PX = 200;
const ROW_HEIGHT_PADDING_RATIO = 14 / 52;
const ROW_HEIGHT_PADDING_MIN = 6;

export interface WeatherWidgetOptions {
  inlineCities?: CityLocation[];
  rowHeight?: number | null;
}

export class WeatherWidget {
  private host: HTMLElement | null = null;
  private isRegistered = false;
  private readonly inlineCities: CityLocation[];
  private readonly customRowHeight: number | null;
  constructor(private readonly plugin: WeatherPlugin, options: WeatherWidgetOptions = {}) {
    this.inlineCities = Array.isArray(options.inlineCities)
      ? options.inlineCities.map((city) => ({ ...city }))
      : [];
    const requestedRowHeight = options.rowHeight;
    this.customRowHeight = typeof requestedRowHeight === "number" && Number.isFinite(requestedRowHeight)
      ? clamp(requestedRowHeight, ROW_HEIGHT_MIN_PX, ROW_HEIGHT_MAX_PX)
      : null;
  }
  mount(containerEl: HTMLElement): void {
    if (this.host !== containerEl) {
      this.unmount();
      this.host = containerEl;
    }
    if (!this.isRegistered) {
      this.plugin.registerWidget(this);
      this.isRegistered = true;
    }
    this.render();
  }
  update(): void {
    if (!this.host) {
      return;
    }

    this.render();
  }
  unmount(): void {
    const host = this.host;
    if (host) {
      host.classList.remove("ow-widget-host");
      host.replaceChildren();
    }
    if (this.isRegistered) {
    this.plugin.unregisterWidget(this);
    this.isRegistered = false;
  }
  this.host = null;
}
  isMounted(): boolean {
    return this.host != null;
  }
  getInlineCities(): CityLocation[] {
    return this.inlineCities.map((city) => ({ ...city }));
  }
  private render(): void {
    if (!this.host) {
      return;
    }
    this.host.classList.add("ow-widget-host");
    const strings = this.plugin.getStrings();
    const settings = this.plugin.settings;
    const locale = this.plugin.getLocale();
    this.host.replaceChildren();
    const activeCities = mergeCityLists(settings.cities, this.inlineCities);
    if (activeCities.length === 0) {
      this.host.createDiv({ cls: "ow-widget ow-widget--empty", text: strings.widget.forecastPlaceholder });
      return;
    }
    const viewerNow = new Date();
    const dateFormat = normalizeDateFormat(settings.dateFormat, DEFAULT_SETTINGS.dateFormat);
    const viewerDateComponents = extractDateComponents(viewerNow);
    const viewerDateKey = createDateKey(viewerDateComponents);
    const container = this.host.createDiv({ cls: "ow-widget" });
    this.applyRowSizing(container);
    for (const city of activeCities) {
      const snapshot = this.plugin.getWeatherSnapshot(city.id);
      if (!snapshot) {
        const pendingRow = container.createDiv({ cls: "ow-row ow-row--loading" });
        pendingRow.createDiv({ cls: "ow-city-name", text: city.label });
        pendingRow.createDiv({ cls: "ow-time-info", text: strings.widget.loadingLabel ?? ":" });
        pendingRow.createDiv({ cls: "ow-weather-info", text: "-" });
        pendingRow.createDiv({ cls: "ow-temperature", text: "--" });
        continue;
      }
      const timezone = snapshot.timezone;
      const explicitOffset = snapshot.timezoneOffsetMinutes ?? null;
      const now = new Date();
      const cityOffsetMinutes = resolveTimezoneOffsetMinutes(now, timezone, explicitOffset, city.longitude);
      const localTime = formatTimeForCity(now, timezone, cityOffsetMinutes, city.longitude, locale);
      const cityDate = formatDateForCity(
        now,
        timezone,
        cityOffsetMinutes,
        city.longitude,
        dateFormat,
        strings.date.monthNames,
      );
      const [hours] = localTime.split(":");
      const hourValue = Number.parseInt(hours ?? "0", 10);
      const temperatureLabel = snapshot.temperature == null || Number.isNaN(snapshot.temperature)
        ? "--"
        : `${snapshot.temperature > 0 ? "+" : ""}${Math.round(snapshot.temperature)}°`;
      const category = wmoToCategory(snapshot.weatherCode);
      const categoryStyle = settings.categoryStyles[category];
      const rawWeatherIcon = categoryStyle?.icon;
      const fallbackWeatherIcon =
        DEFAULT_SETTINGS.categoryStyles[category]?.icon ?? WEATHER_FALLBACK_ICON;
      const weatherIcon =
        typeof rawWeatherIcon === "string" ? rawWeatherIcon.trim() : fallbackWeatherIcon;
      const weatherColor = ensureHex(categoryStyle?.color ?? "#6b7280", "#6b7280");
      const weatherLabel = strings.weatherConditions[category] ?? category;
      const sunPosition = sunPositionPercent(snapshot.sunrise, snapshot.sunset, timezone, cityOffsetMinutes, city.longitude);
      const sunriseMinutes = parseHmFromIsoLocal(snapshot.sunrise);
      const sunsetMinutes = parseHmFromIsoLocal(snapshot.sunset);
      const timePhase = resolveTimePhaseColor(
        settings,
        snapshot.sunrise,
        snapshot.sunset,
        timezone,
        cityOffsetMinutes,
        city.longitude,
      );
      const derivedPhase = timePhase.phase ?? getTimeOfDay(Number.isFinite(hourValue) ? hourValue : 0);
      const timeIconSource = settings.timeIcons?.[derivedPhase];
      const timeIcon =
        typeof timeIconSource === "string"
          ? timeIconSource.trim()
          : TIME_ICON_DEFAULTS[derivedPhase]?.trim() ?? "";
      const baseColor = ensureHex(timePhase.color, settings.timeBaseColors[derivedPhase]);
      const temperatureColor = tempToColor(snapshot.temperature, settings.temperatureGradient);
      const gradientState = computeGradientLayers({
        settings,
        baseColor,
        weatherColor,
        temperatureColor,
        sunriseMinutes,
        sunsetMinutes,
      });
      const row = container.createDiv({ cls: "ow-row" });
      row.style.backgroundColor = gradientState.backgroundColor;
      row.style.backgroundImage = `${gradientState.temperatureGradient}, ${gradientState.weatherGradient}`;
      row.style.backgroundRepeat = "no-repeat, no-repeat";
      row.style.backgroundBlendMode = "normal, normal";
      row.style.backgroundSize = "100% 100%, 100% 100%";
      const measuredRowWidth = row.clientWidth || row.offsetWidth;
      const rowWidthPx = Number.isFinite(measuredRowWidth) && (measuredRowWidth ?? 0) > 0
        ? (measuredRowWidth as number)
        : (this.host?.clientWidth || container.clientWidth || 600);
      const overlay = row.createDiv({ cls: "ow-sun-overlay" });
      const nowMinutes = timezone
        ? minutesOfDayInTimezone(now, timezone)
        : minutesOfDayWithOffset(now, cityOffsetMinutes);
      const cityLocalDate = shiftedDateByOffset(now, cityOffsetMinutes);
      const sunAltitude = computeSolarAltitude(
        cityLocalDate,
        city.latitude,
        city.longitude,
        cityOffsetMinutes,
      );
      const overlayState = buildSunOverlayState({
        settings,
        nowMinutes,
        sunriseMinutes,
        sunsetMinutes,
        sunPositionPercent: sunPosition,
        timeOfDay: derivedPhase,
        sunAltitudeDegrees: sunAltitude ?? undefined,
        rowWidthPx,
      });
      overlay.style.background = overlayState.background;
      overlay.style.backgroundBlendMode = overlayState.blendMode;
      overlay.style.backgroundRepeat = "no-repeat, no-repeat";
      overlay.style.backgroundSize = "100% 100%, 100% 100%";
      overlay.style.left = `${overlayState.leftPercent}%`;
      overlay.style.right = "auto";
      overlay.style.width = `${overlayState.widthPercent}%`;
      overlay.style.top = "0";
      overlay.style.bottom = "0";
      const sunIconEl = row.createSpan({ cls: "ow-sun-overlay__icon" });
      sunIconEl.setAttr("aria-hidden", "true");
      sunIconEl.classList.toggle("is-monospaced", Boolean(settings.sunLayer.icon.monospaced));
      sunIconEl.textContent = overlayState.icon.symbol;
      sunIconEl.style.left = `${overlayState.icon.leftPercent}%`;
      sunIconEl.style.top = `${overlayState.icon.topPercent}%`;
      sunIconEl.style.transform = `translate(-50%, -50%) scale(${overlayState.icon.scale})`;
      sunIconEl.dataset.verticalProgress = overlayState.icon.verticalProgress.toFixed(3);
      sunIconEl.style.color = overlayState.icon.color;
      sunIconEl.style.opacity = `${overlayState.icon.opacity}`;
      const leftGroup = row.createDiv({ cls: "ow-row__group ow-row__group--left" });
      const weatherInfo = leftGroup.createDiv({ cls: "ow-weather-info" });
      if (weatherIcon.length > 0) {
        weatherInfo.createSpan({ text: weatherIcon });
      }
      weatherInfo.createSpan({ text: weatherLabel });
      const nameEl = leftGroup.createDiv({ cls: "ow-city-name" });
      nameEl.textContent = city.label || "-";
      const rightGroup = row.createDiv({ cls: "ow-row__group ow-row__group--right" });
      const timeInfo = rightGroup.createDiv({ cls: "ow-time-info" });
      if (timeIcon.length > 0) {
        timeInfo.createSpan({ text: timeIcon });
      }
      timeInfo.createSpan({ text: localTime });
      if (settings.showDateWhenDifferent && cityDate.key !== viewerDateKey) {
        timeInfo.createSpan({ cls: "ow-date", text: cityDate.label });
      }
      const temperatureEl = rightGroup.createDiv({ cls: "ow-temperature" });
      temperatureEl.textContent = temperatureLabel;
    }
  }

  private applyRowSizing(target: HTMLElement): void {
    if (this.customRowHeight != null) {
      const height = clamp(this.customRowHeight, ROW_HEIGHT_MIN_PX, ROW_HEIGHT_MAX_PX);
      const padding = clamp(
        Math.round(height * ROW_HEIGHT_PADDING_RATIO),
        ROW_HEIGHT_PADDING_MIN,
        Math.max(ROW_HEIGHT_PADDING_MIN, Math.round(height / 2)),
      );
      target.style.setProperty("--ow-row-min-height", `${height.toFixed(2)}px`);
      target.style.setProperty("--ow-row-padding-y", `${padding}px`);
    } else {
      target.style.removeProperty("--ow-row-min-height");
      target.style.removeProperty("--ow-row-padding-y");
    }
  }
}
