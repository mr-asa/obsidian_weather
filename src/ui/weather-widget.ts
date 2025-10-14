import type WeatherPlugin from "../main";
import {
  DEFAULT_SETTINGS,
  type CityLocation,
  type TemperatureColorStop,
  type WeatherCategory,
  type WeatherWidgetSettings,
  type TimeOfDayKey,
} from "../settings";
import type { WeatherSnapshot } from "../services/weather-service";
import { clamp, lerp } from "../utils/math";
import { ensureHex, lerpColorGamma, rgba } from "../utils/color";
import { buildSunOverlayState, computeGradientLayers } from "../utils/widget-render";
import { computeSolarAltitude, timezoneOffsetFromIdentifier } from "../utils/solar";
import {
  createDateKey,
  extractDateComponents,
  formatDateComponents,
  normalizeDateFormat,
  type DateComponents,
} from "../utils/date-format";
const MINUTES_IN_DAY = 1_440;
const MS_PER_MINUTE = 60_000;
const TIME_EMOJIS: Record<TimeOfDayKey, string> = {
  morning: "🌅",
  day: "🌞",
  evening: "🌇",
  night: "🌙",
};

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
): { label: string; key: string } {
  const components = resolveCityDateComponents(date, timezone, timezoneOffsetMinutes, longitude);
  const normalizedFormat = normalizeDateFormat(formatPattern, DEFAULT_SETTINGS.dateFormat);
  const label = formatDateComponents(components, normalizedFormat, DEFAULT_SETTINGS.dateFormat);
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

function timeColorBySun(
  settings: WeatherWidgetSettings,
  sunriseIso: string | null,
  sunsetIso: string | null,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
): TimePaletteColor {
  const sunriseMinutes = parseHmFromIsoLocal(sunriseIso);
  const sunsetMinutes = parseHmFromIsoLocal(sunsetIso);
  const now = new Date();
  const nowMinutes = timezone
    ? minutesOfDayInTimezone(now, timezone)
    : typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)
      ? minutesOfDayWithOffset(now, timezoneOffsetMinutes)
      : minutesOfDayAtLon(now, longitude);
  if (sunriseMinutes == null || sunsetMinutes == null || sunsetMinutes <= sunriseMinutes) {
    const tod = getTimeOfDay(Math.floor(nowMinutes / 60));
    return ensureHex(settings.timeBaseColors[tod]);
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

  const sunsetWindowStart = Math.max(0, sunsetMinutes - sunsetBefore);
  const sunsetWindowEnd = Math.min(MINUTES_IN_DAY, sunsetMinutes + sunsetAfter);
  const sunriseWindowEnd = sunriseMinutes + sunriseAfter;
  const beforeSunriseDistance = (sunriseMinutes - nowMinutes + MINUTES_IN_DAY) % MINUTES_IN_DAY;

  if (sunriseBefore > 0 && beforeSunriseDistance <= sunriseBefore) {
    const window = Math.max(1, sunriseBefore);
    const t = 1 - beforeSunriseDistance / window;
    const eased = easeCos(t);
    return lerpColorGamma(colors.night, colors.morning, eased);
  }

  if (sunriseAfter > 0 && nowMinutes >= sunriseMinutes && nowMinutes <= sunriseWindowEnd) {
    const window = Math.max(1, sunriseAfter);
    const t = (nowMinutes - sunriseMinutes) / window;
    const eased = easeCos(t);
    return lerpColorGamma(colors.morning, colors.day, eased);
  }

  if (sunsetBefore > 0 && nowMinutes >= sunsetWindowStart && nowMinutes < sunsetMinutes) {
    const span = Math.max(1, sunsetMinutes - sunsetWindowStart);
    const t = (nowMinutes - sunsetWindowStart) / span;
    const eased = easeCos(t);
    return lerpColorGamma(colors.day, colors.evening, eased);
  }

  if (sunsetAfter > 0 && nowMinutes >= sunsetMinutes && nowMinutes <= sunsetWindowEnd) {
    const span = Math.max(1, sunsetWindowEnd - sunsetMinutes);
    const t = (nowMinutes - sunsetMinutes) / span;
    const eased = easeCos(t);
    return lerpColorGamma(colors.evening, colors.night, eased);
  }

  if (nowMinutes >= sunriseWindowEnd && nowMinutes < sunsetWindowStart) {
    return colors.day;
  }

  const phase = getTimeOfDay(Math.floor(nowMinutes / 60));
  return colors[phase] ?? colors.day;
}
export class WeatherWidget {
  private host: HTMLElement | null = null;
  private isRegistered = false;
  constructor(private readonly plugin: WeatherPlugin) {}
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
    if (this.isRegistered) {
      this.plugin.unregisterWidget(this);
      this.isRegistered = false;
    }
    this.host = null;
  }
  isMounted(): boolean {
    return this.host != null;
  }
  private render(): void {
    if (!this.host) {
      return;
    }
    const strings = this.plugin.getStrings();
    const settings = this.plugin.settings;
    const locale = this.plugin.getLocale();
    this.host.replaceChildren();
    if (settings.cities.length === 0) {
      this.host.createDiv({ cls: "city-widget city-widget--empty", text: strings.widget.forecastPlaceholder });
      return;
    }
    const viewerNow = new Date();
    const dateFormat = normalizeDateFormat(settings.dateFormat, DEFAULT_SETTINGS.dateFormat);
    const viewerDateComponents = extractDateComponents(viewerNow);
    const viewerDateKey = createDateKey(viewerDateComponents);
    const container = this.host.createDiv({ cls: "city-widget" });
    for (const city of settings.cities) {
      const snapshot = this.plugin.getWeatherSnapshot(city.id);
      if (!snapshot) {
        const pendingRow = container.createDiv({ cls: "city-row city-row--loading" });
        pendingRow.createDiv({ cls: "city-name", text: city.label });
        pendingRow.createDiv({ cls: "time-info", text: strings.widget.loadingLabel ?? "…" });
        pendingRow.createDiv({ cls: "weather-info", text: "-" });
        pendingRow.createDiv({ cls: "temperature", text: "--" });
        continue;
      }
      const timezone = snapshot.timezone;
      const explicitOffset = snapshot.timezoneOffsetMinutes ?? null;
      const now = new Date();
      const cityOffsetMinutes = resolveTimezoneOffsetMinutes(now, timezone, explicitOffset, city.longitude);
      const localTime = formatTimeForCity(now, timezone, cityOffsetMinutes, city.longitude, locale);
      const cityDate = formatDateForCity(now, timezone, cityOffsetMinutes, city.longitude, dateFormat);
      const [hours] = localTime.split(":");
      const hourValue = Number.parseInt(hours ?? "0", 10);
      const timeOfDay = getTimeOfDay(Number.isFinite(hourValue) ? hourValue : 0);
      const temperatureLabel = snapshot.temperature == null || Number.isNaN(snapshot.temperature)
        ? "--"
        : `${snapshot.temperature > 0 ? "+" : ""}${Math.round(snapshot.temperature)}°`;
      const category = wmoToCategory(snapshot.weatherCode);
      const categoryStyle = settings.categoryStyles[category];
      const weatherIcon = categoryStyle?.icon?.trim() ?? WEATHER_FALLBACK_ICON;
      const weatherColor = ensureHex(categoryStyle?.color ?? "#6b7280", "#6b7280");
      const weatherLabel = strings.weatherConditions[category] ?? category;
      const sunPosition = sunPositionPercent(snapshot.sunrise, snapshot.sunset, timezone, cityOffsetMinutes, city.longitude);
      const sunriseMinutes = parseHmFromIsoLocal(snapshot.sunrise);
      const sunsetMinutes = parseHmFromIsoLocal(snapshot.sunset);
      const timeColor = timeColorBySun(settings, snapshot.sunrise, snapshot.sunset, timezone, cityOffsetMinutes, city.longitude);
      const baseFallback = ensureHex(settings.timeBaseColors[timeOfDay]);
      const baseColor = lerpColorGamma(baseFallback, timeColor, 0.6);
      const temperatureColor = tempToColor(snapshot.temperature, settings.temperatureGradient);
      const gradientState = computeGradientLayers({
        settings,
        baseColor,
        weatherColor,
        temperatureColor,
        sunriseMinutes,
        sunsetMinutes,
      });
      const row = container.createDiv({ cls: "city-row" });
      row.style.backgroundColor = gradientState.backgroundColor;
      row.style.backgroundImage = `${gradientState.temperatureGradient}, ${gradientState.weatherGradient}`;
      row.style.backgroundRepeat = "no-repeat, no-repeat";
      row.style.backgroundBlendMode = "normal, normal";
      const overlay = row.createDiv({ cls: "sun-overlay" });
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
        timeOfDay,
        sunAltitudeDegrees: sunAltitude ?? undefined,
      });
      overlay.style.background = overlayState.background;
      overlay.style.backgroundBlendMode = overlayState.blendMode;
      overlay.style.left = `-${overlayState.offsetPercent}%`;
      overlay.style.right = "auto";
      overlay.style.width = `${overlayState.widthPercent}%`;
      overlay.style.top = "-16px";
      overlay.style.bottom = "-16px";
      const sunIconEl = row.createSpan({ cls: "sun-overlay__icon" });
      sunIconEl.setAttr("aria-hidden", "true");
      sunIconEl.classList.toggle("is-monospaced", Boolean(settings.sunLayer.icon.monospaced));
      sunIconEl.textContent = overlayState.icon.symbol;
      sunIconEl.style.left = `${overlayState.icon.leftPercent}%`;
      sunIconEl.style.top = `${overlayState.icon.topPercent}%`;
      sunIconEl.style.transform = `translate(-50%, -50%) scale(${overlayState.icon.scale})`;
      sunIconEl.dataset.verticalProgress = overlayState.icon.verticalProgress.toFixed(3);
      sunIconEl.style.color = overlayState.icon.color;
      sunIconEl.style.opacity = `${overlayState.icon.opacity}`;
      const leftGroup = row.createDiv({ cls: "city-row__group city-row__group--left" });
      const weatherInfo = leftGroup.createDiv({ cls: "weather-info" });
      weatherInfo.createSpan({ text: weatherIcon });
      weatherInfo.createSpan({ text: weatherLabel });
      const nameEl = leftGroup.createDiv({ cls: "city-name" });
      nameEl.textContent = city.label || "-";
      const rightGroup = row.createDiv({ cls: "city-row__group city-row__group--right" });
      const timeInfo = rightGroup.createDiv({ cls: "time-info" });
      timeInfo.createSpan({ text: TIME_EMOJIS[timeOfDay] ?? "" });
      timeInfo.createSpan({ text: localTime });
      if (settings.showDateWhenDifferent && cityDate.key !== viewerDateKey) {
        timeInfo.createSpan({ cls: "date", text: cityDate.label });
      }
      const temperatureEl = rightGroup.createDiv({ cls: "temperature" });
      temperatureEl.textContent = temperatureLabel;
    }
  }
}
