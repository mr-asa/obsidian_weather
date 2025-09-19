import type WeatherPlugin from "../main";

import type {

  CityLocation,

  TemperatureColorStop,

  WeatherCategory,

  WeatherWidgetSettings,

  TimeOfDayKey,

} from "../settings";

import type { WeatherSnapshot } from "../services/weather-service";

import { clamp, lerp } from "../utils/math";

import { ensureHex, lerpColorGamma, rgba } from "../utils/color";

const MINUTES_IN_DAY = 1_440;

const MS_PER_MINUTE = 60_000;

const TIME_EMOJIS: Record<TimeOfDayKey, string> = {

  morning: "🌅",

  day: "🌞",

  evening: "🌇",

  night: "🌙",

};

const WEATHER_FALLBACK_ICON = "☁";

interface Palette {

  base: string;

  tint: string;

}

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

function formatTimeForCity(date: Date, timezone: string | null, longitude: number, locale: string): string {

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

  const shifted = shiftedDateByOffset(date, clampOffsetByLon(longitude));

  return shifted.toLocaleTimeString(locale, {

    hour: "2-digit",

    minute: "2-digit",

    hour12: false,

  });

}

function formatDateForCity(date: Date, timezone: string | null, longitude: number, locale: string): string {

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

    : minutesOfDayAtLon(now, longitude);

  if (minutesNow <= sunrise) {

    return 0;

  }

  if (minutesNow >= sunset) {

    return 100;

  }

  return ((minutesNow - sunrise) / (sunset - sunrise)) * 100;

}

function timePaletteBySun(

  settings: WeatherWidgetSettings,

  sunriseIso: string | null,

  sunsetIso: string | null,

  timezone: string | null,

  longitude: number,

): Palette {

  const sunriseMinutes = parseHmFromIsoLocal(sunriseIso);

  const sunsetMinutes = parseHmFromIsoLocal(sunsetIso);

  const now = new Date();

  const nowMinutes = timezone

    ? minutesOfDayInTimezone(now, timezone)

    : minutesOfDayAtLon(now, longitude);

  if (sunriseMinutes == null || sunsetMinutes == null || sunsetMinutes <= sunriseMinutes) {

    const tod = getTimeOfDay(Math.floor(nowMinutes / 60));

    return {

      base: ensureHex(settings.timeBaseColors[tod]),

      tint: ensureHex(settings.timeTintColors[tod]),

    };

  }

  const mid = Math.floor((sunriseMinutes + sunsetMinutes) / 2);

  const stops = [

    { m: 0, base: ensureHex(settings.timeBaseColors.night), tint: ensureHex(settings.timeTintColors.night) },

    { m: sunriseMinutes, base: ensureHex(settings.timeBaseColors.morning), tint: ensureHex(settings.timeTintColors.morning) },

    { m: mid, base: ensureHex(settings.timeBaseColors.day), tint: ensureHex(settings.timeTintColors.day) },

    { m: sunsetMinutes, base: ensureHex(settings.timeBaseColors.evening), tint: ensureHex(settings.timeTintColors.evening) },

    { m: MINUTES_IN_DAY, base: ensureHex(settings.timeBaseColors.night), tint: ensureHex(settings.timeTintColors.night) },

  ];

  for (let i = 0; i < stops.length - 1; i += 1) {

    const current = stops[i];

    const next = stops[i + 1];

    if (nowMinutes >= current.m && nowMinutes <= next.m) {

      const factor = (nowMinutes - current.m) / Math.max(1, next.m - current.m);

      return {

        base: lerpColorGamma(current.base, next.base, factor),

        tint: lerpColorGamma(current.tint, next.tint, factor),

      };

    }

  }

  return {

    base: ensureHex(settings.timeBaseColors.night),

    tint: ensureHex(settings.timeTintColors.night),

  };

}

function buildSoftHillGradient(

  color: string,

  leftFrac: number,

  rightFrac: number,

  peakAlpha: number,

  edgeAlpha: number,

  options: { steps: number; power: number },

): string {

  const normalizedLeft = clamp01(leftFrac);

  const normalizedRight = clamp01(Math.max(normalizedLeft, rightFrac));

  const stops: string[] = [`${rgba(color, 0)} 0%`];

  for (let i = 0; i <= options.steps; i += 1) {

    const t = options.steps === 0 ? 0 : i / options.steps;

    const position = normalizedLeft + (normalizedRight - normalizedLeft) * t;

    const envelope = Math.pow(Math.sin(Math.PI * t), options.power);

    const alpha = clamp01(edgeAlpha + (peakAlpha - edgeAlpha) * envelope);

    const pct = Math.round(position * 1000) / 10;

    stops.push(`${rgba(color, alpha)} ${pct}%`);

  }

  stops.push(`${rgba(color, 0)} 100%`);

  return `linear-gradient(90deg, ${stops.join(", ")})`;

}

function computeSunHighlight(settings: WeatherWidgetSettings, timeOfDay: TimeOfDayKey): number {

  if (timeOfDay === "night") {

    return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.nightHighlight);

  }

  if (timeOfDay === "day") {

    return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.dayHighlight);

  }

  return Math.max(settings.leftPanel.minHighlight, settings.sunLayer.twilightHighlight);

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

      const now = new Date();

      const localTime = formatTimeForCity(now, timezone, city.longitude, locale);

      const localDate = formatDateForCity(now, timezone, city.longitude, locale);

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

      const sunPosition = sunPositionPercent(snapshot.sunrise, snapshot.sunset, timezone, city.longitude);

      const sunriseMinutes = parseHmFromIsoLocal(snapshot.sunrise);

      const sunsetMinutes = parseHmFromIsoLocal(snapshot.sunset);

      const dayStartFrac = sunriseMinutes != null ? clamp01(sunriseMinutes / MINUTES_IN_DAY) : settings.daySpan.min;

      const dayEndFrac = sunsetMinutes != null ? clamp01(sunsetMinutes / MINUTES_IN_DAY) : settings.daySpan.max;

      const daySpan = Math.max(settings.daySpan.min, Math.min(settings.daySpan.max, dayEndFrac - dayStartFrac));

      const spanNorm = clamp01((daySpan - settings.daySpan.min) / Math.max(0.0001, settings.daySpan.max - settings.daySpan.min));

      const palette = timePaletteBySun(settings, snapshot.sunrise, snapshot.sunset, timezone, city.longitude);

      const baseFallback = ensureHex(settings.timeBaseColors[timeOfDay]);

      const baseColor = lerpColorGamma(baseFallback, palette.base, 0.6);

      const transitionColor = lerpColorGamma(baseColor, weatherColor, settings.gradients.timeBlend.mixRatio);

      const timeLayer = settings.gradients.timeBlend;

      const timeWidth = timeLayer.padding * lerp(timeLayer.widthMin, timeLayer.widthMax, spanNorm);

      const timeGradient = buildSoftHillGradient(

        transitionColor,

        clamp01(dayStartFrac - daySpan * timeWidth),

        clamp01(dayEndFrac + daySpan * timeWidth),

        timeLayer.peakAlpha,

        timeLayer.edgeAlpha,

        { steps: timeLayer.steps, power: timeLayer.power },

      );

      const weatherLayer = settings.gradients.weather;

      const weatherWidth = weatherLayer.padding * lerp(weatherLayer.widthMin, weatherLayer.widthMax, spanNorm);

      const weatherPeakAlpha = 0.9 * (category === "cloudy" || category === "foggy" ? 0.7 : 1);

      const weatherGradient = buildSoftHillGradient(

        weatherColor,

        clamp01(dayStartFrac - daySpan * weatherWidth),

        clamp01(dayEndFrac + daySpan * weatherWidth),

        weatherPeakAlpha * weatherLayer.peakScale,

        weatherPeakAlpha * 0.12 * weatherLayer.edgeScale,

        { steps: weatherLayer.steps, power: weatherLayer.power },

      );

      const temperatureGradient = buildSoftHillGradient(

        tempToColor(snapshot.temperature, settings.temperatureGradient),

        settings.gradients.temperature.start,

        settings.gradients.temperature.end,

        settings.gradients.temperature.peakAlpha,

        settings.gradients.temperature.edgeAlpha,

        {

          steps: settings.gradients.temperature.steps,

          power: settings.gradients.temperature.power,

        },

      );

      const row = container.createDiv({ cls: "city-row" });

      row.style.background = `${temperatureGradient}, ${weatherGradient}, ${timeGradient}`;

      row.style.backgroundBlendMode = "normal, soft-light, soft-light";

      const overlay = row.createDiv({ cls: "sun-overlay" });

      const sunLayer = settings.sunLayer;

      const sunWidth = sunLayer.width;

      const sunHighlight = computeSunHighlight(settings, timeOfDay);

      const sunrise = parseHmFromIsoLocal(snapshot.sunrise);

      const sunset = parseHmFromIsoLocal(snapshot.sunset);

      const nowMinutes = timezone

        ? minutesOfDayInTimezone(new Date(), timezone)

        : minutesOfDayAtLon(new Date(), city.longitude);

      const isNight = sunrise != null && sunset != null

        ? nowMinutes < sunrise || nowMinutes > sunset

        : timeOfDay === "night";

      let sunColor = ensureHex(sunLayer.colors.day, "#FFD200");

      let alphaPeak = sunLayer.alphaDay.peak;

      let alphaMid = sunLayer.alphaDay.mid;

      let alphaLow = sunLayer.alphaDay.low;

      if (sunrise != null && sunset != null) {

        if (nowMinutes >= Math.max(0, sunset - sunLayer.transitionMinutes) && nowMinutes < sunset) {

          const t = easeCos(1 - ((sunset - nowMinutes) / sunLayer.transitionMinutes));

          sunColor = lerpColorGamma(sunLayer.colors.day, sunLayer.colors.sunrise, t);

          alphaPeak = sunLayer.alphaDay.peak;

          alphaMid = sunLayer.alphaDay.mid;

          alphaLow = sunLayer.alphaDay.low;

        } else if (nowMinutes >= sunset && nowMinutes <= Math.min(1440, sunset + sunLayer.transitionMinutes)) {

          const t = easeCos((nowMinutes - sunset) / sunLayer.transitionMinutes);

          sunColor = lerpColorGamma(sunLayer.colors.sunrise, sunLayer.colors.night, t);

          alphaPeak = lerp(sunLayer.alphaDay.peak, sunLayer.alphaNight.peak, t);

          alphaMid = lerp(sunLayer.alphaDay.mid, sunLayer.alphaNight.mid, t);

          alphaLow = lerp(sunLayer.alphaDay.low, sunLayer.alphaNight.low, t);

        } else if (((sunrise - nowMinutes + MINUTES_IN_DAY) % MINUTES_IN_DAY) <= sunLayer.transitionMinutes) {

          const distance = (sunrise - nowMinutes + MINUTES_IN_DAY) % MINUTES_IN_DAY;

          const t = easeCos(1 - (distance / sunLayer.transitionMinutes));

          sunColor = lerpColorGamma(sunLayer.colors.night, sunLayer.colors.sunrise, t);

          alphaPeak = lerp(sunLayer.alphaNight.peak, sunLayer.alphaDay.peak, t);

          alphaMid = lerp(sunLayer.alphaNight.mid, sunLayer.alphaDay.mid, t);

          alphaLow = lerp(sunLayer.alphaNight.low, sunLayer.alphaDay.low, t);

        } else if (nowMinutes >= sunrise && nowMinutes <= sunrise + sunLayer.transitionMinutes) {

          const t = easeCos((nowMinutes - sunrise) / sunLayer.transitionMinutes);

          sunColor = lerpColorGamma(sunLayer.colors.sunrise, sunLayer.colors.day, t);

          alphaPeak = sunLayer.alphaDay.peak;

          alphaMid = sunLayer.alphaDay.mid;

          alphaLow = sunLayer.alphaDay.low;

        } else if (isNight) {

          sunColor = sunLayer.colors.night;

          alphaPeak = sunLayer.alphaNight.peak;

          alphaMid = sunLayer.alphaNight.mid;

          alphaLow = sunLayer.alphaNight.low;

        } else {

          sunColor = sunLayer.colors.day;

          alphaPeak = sunLayer.alphaDay.peak;

          alphaMid = sunLayer.alphaDay.mid;

          alphaLow = sunLayer.alphaDay.low;

        }

      } else if (isNight) {

        sunColor = sunLayer.colors.night;

        alphaPeak = sunLayer.alphaNight.peak;

        alphaMid = sunLayer.alphaNight.mid;

        alphaLow = sunLayer.alphaNight.low;

      }

      const center = Math.max(0, Math.min(100, sunPosition));

      const s0 = Math.max(0, center - sunWidth);

      const s1 = Math.max(0, center - sunWidth * sunLayer.softnessOuter);

      const s2 = Math.max(0, center - sunWidth * sunLayer.softnessInner);

      const s3 = Math.min(100, center + sunWidth * sunLayer.softnessInner);

      const s4 = Math.min(100, center + sunWidth * sunLayer.softnessOuter);

      const s5 = Math.min(100, center + sunWidth);

      const sunGradient = `linear-gradient(90deg,

        transparent 0%,

        transparent ${s0}%,

        ${rgba(sunColor, alphaLow)} ${s1}%,

        ${rgba(sunColor, alphaMid)} ${s2}%,

        ${rgba(sunColor, alphaPeak)} ${center}%,

        ${rgba(sunColor, alphaMid)} ${s3}%,

        ${rgba(sunColor, alphaLow)} ${s4}%,

        transparent ${s5}%,

        transparent 100%)`;

      const verticalFade = `linear-gradient(180deg,

        rgba(0,0,0,${settings.verticalFade.top}) 0%,

        rgba(0,0,0,${settings.verticalFade.middle}) 20%,

        rgba(0,0,0,${settings.verticalFade.middle}) 80%,

        rgba(0,0,0,${settings.verticalFade.top}) 100%)`;

      const highlight = computeSunHighlight(settings, timeOfDay);

      const tintColor = palette.tint || weatherColor;

      const leftMask = `linear-gradient(90deg,

        ${rgba(tintColor, highlight)} 0%,

        ${rgba(tintColor, highlight)} ${settings.leftPanel.width}%,

        transparent ${settings.leftPanel.width + 5}%,

        transparent 100%)`;

      overlay.style.background = `${sunGradient}, ${verticalFade}, ${leftMask}`;

      overlay.style.backgroundBlendMode = isNight ? "multiply, multiply, screen" : "screen, normal, screen";

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

