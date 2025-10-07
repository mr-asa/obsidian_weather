import type WeatherPlugin from "../main";
import {
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

function formatDateForCity(
  date: Date,
  timezone: string | null,
  timezoneOffsetMinutes: number | null,
  longitude: number,
  locale: string,
): string {
  if (timezone) {
    try {
      return date.toLocaleDateString(locale, {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
      });
    } catch (error) {
      console.warn("WeatherWidget: failed to format date with timezone", timezone, error);
    }
  }
  if (typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)) {
    const shifted = shiftedDateByOffset(date, timezoneOffsetMinutes);
    return shifted.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
    });
  }
  const shifted = shiftedDateByOffset(date, clampOffsetByLon(longitude));
  return shifted.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
  });
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
  const mid = Math.floor((sunriseMinutes + sunsetMinutes) / 2);
  const stops = [
    { m: 0, color: ensureHex(settings.timeBaseColors.night) },
    { m: sunriseMinutes, color: ensureHex(settings.timeBaseColors.morning) },
    { m: mid, color: ensureHex(settings.timeBaseColors.day) },
    { m: sunsetMinutes, color: ensureHex(settings.timeBaseColors.evening) },
    { m: MINUTES_IN_DAY, color: ensureHex(settings.timeBaseColors.night) },
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const current = stops[i];
    const next = stops[i + 1];
    if (nowMinutes >= current.m && nowMinutes <= next.m) {
      const factor = (nowMinutes - current.m) / Math.max(1, next.m - current.m);
      return lerpColorGamma(current.color, next.color, factor);
    }
  }
  return ensureHex(settings.timeBaseColors.night);
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
    if (!this.isMounted()) {
      this.unmount();
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
    return this.host != null && this.host.isConnected;
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
    const viewerDate = viewerNow.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
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
      const timezoneOffset = snapshot.timezoneOffsetMinutes ?? null;
      const now = new Date();
      const localTime = formatTimeForCity(now, timezone, timezoneOffset, city.longitude, locale);
      const localDate = formatDateForCity(now, timezone, timezoneOffset, city.longitude, locale);
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
      const sunPosition = sunPositionPercent(snapshot.sunrise, snapshot.sunset, timezone, timezoneOffset, city.longitude);
      const sunriseMinutes = parseHmFromIsoLocal(snapshot.sunrise);
      const sunsetMinutes = parseHmFromIsoLocal(snapshot.sunset);
      const timeColor = timeColorBySun(settings, snapshot.sunrise, snapshot.sunset, timezone, timezoneOffset, city.longitude);
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
        : typeof timezoneOffset === "number" && Number.isFinite(timezoneOffset)
          ? minutesOfDayWithOffset(now, timezoneOffset)
          : minutesOfDayAtLon(now, city.longitude);
      const overlayState = buildSunOverlayState({
        settings,
        nowMinutes,
        sunriseMinutes,
        sunsetMinutes,
        sunPositionPercent: sunPosition,
        timeOfDay,
      });
      overlay.style.background = overlayState.background;
      overlay.style.backgroundBlendMode = overlayState.blendMode;
      overlay.style.left = `-${overlayState.offsetPercent}%`;
      overlay.style.right = "auto";
      overlay.style.width = `${overlayState.widthPercent}%`;
      overlay.style.top = "0";
      overlay.style.bottom = "0";
      const sunIconEl = overlay.createSpan({ cls: "sun-overlay__icon" });
      sunIconEl.textContent = overlayState.icon.symbol;
      sunIconEl.style.left = `${overlayState.icon.leftPercent}%`;
      sunIconEl.style.top = `${overlayState.icon.topPercent}%`;
      sunIconEl.style.transform = `translate(-50%, -50%) scale(${overlayState.icon.scale})`;
      sunIconEl.style.color = overlayState.icon.color;
      sunIconEl.style.opacity = `${overlayState.icon.opacity}`;
      const nameEl = row.createDiv({ cls: "city-name" });
      nameEl.textContent = city.label || "-";
      const timeInfo = row.createDiv({ cls: "time-info" });
      timeInfo.createSpan({ text: TIME_EMOJIS[timeOfDay] ?? "" });
      timeInfo.createSpan({ text: localTime });
      if (settings.showDateWhenDifferent && localDate !== viewerDate) {
        timeInfo.createSpan({ cls: "date", text: localDate });
      }
      const weatherInfo = row.createDiv({ cls: "weather-info" });
      weatherInfo.createSpan({ text: weatherIcon });
      weatherInfo.createSpan({ text: weatherLabel });
      row.createDiv({ cls: "temperature", text: temperatureLabel });
    }
  }
}
