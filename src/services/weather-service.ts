import type { CityLocation, WeatherProviderId } from "../settings";
export interface WeatherSnapshot {
  cityId: string;
  fetchedAt: number;
  latitude: number;
  longitude: number;
  timezone: string | null;
  timezoneOffsetMinutes: number | null;
  sunrise: string | null;
  sunset: string | null;
  temperature: number | null;
  weatherCode: number | null;
}
const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const OPEN_WEATHER_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather";
function createOpenMeteoUrl(city: CityLocation): string {
    const params = new URLSearchParams({
      latitude: city.latitude.toString(),
      longitude: city.longitude.toString(),
      current: "temperature_2m,weather_code",
      daily: "sunrise,sunset",
      forecast_days: "1",
      timezone: "auto",
    });
  return `${OPEN_METEO_ENDPOINT}?${params.toString()}`;
}
function createOpenWeatherUrl(city: CityLocation, apiKey: string): string {
    const params = new URLSearchParams({
    lat: city.latitude.toString(),
    lon: city.longitude.toString(),
    appid: apiKey,
    units: "metric",
  });
  return `${OPEN_WEATHER_ENDPOINT}?${params.toString()}`;
}
function toLocalIsoString(epochSeconds: number, offsetSeconds: number): string {
  const localMillis = (epochSeconds + offsetSeconds) * 1_000;
  const date = new Date(localMillis);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
function mapOpenWeatherToWmo(code: number | undefined | null): number | null {
  if (typeof code !== "number") {
    return null;
  }
  if (code >= 200 && code <= 232) {
    return 95;
  }
  if (code >= 300 && code <= 321) {
    return 51;
  }
  if (code >= 500 && code <= 504) {
    return 61;
  }
  if (code === 511) {
    return 66;
  }
  if (code >= 520 && code <= 531) {
    return 63;
  }
  if (code >= 600 && code <= 602) {
    return 71;
  }
  if (code >= 611 && code <= 622) {
    return 77;
  }
  if (code >= 700 && code <= 781) {
    return 45;
  }
  if (code === 800) {
    return 0;
  }
  if (code === 801) {
    return 1;
  }
  if (code === 802) {
    return 2;
  }
  if (code === 803 || code === 804) {
    return 3;
  }
  return null;
}
export class WeatherService {
  private cache = new Map<string, WeatherSnapshot>();
  private expiration = new Map<string, number>();
  private provider: WeatherProviderId = "open-meteo";
  private apiKey = "";
  constructor(private readonly logger: Console = console) {}
  configureProvider(provider: WeatherProviderId, apiKey: string): void {
    const normalizedKey = apiKey.trim();
    if (this.provider !== provider || this.apiKey !== normalizedKey) {
      this.provider = provider;
      this.apiKey = normalizedKey;
      this.clear();
    }
  }
  getSnapshot(cityId: string): WeatherSnapshot | undefined {
    const key = this.cacheKey(cityId);
    const snapshot = this.cache.get(key);
    if (!snapshot) {
      return undefined;
    }
    const expiresAt = this.expiration.get(key);
    if (expiresAt && Date.now() > expiresAt) {
      this.cache.delete(key);
      this.expiration.delete(key);
      return undefined;
    }
    return snapshot;
  }
  async refreshCity(city: CityLocation, cacheMinutes: number): Promise<WeatherSnapshot | null> {
    if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) {
      this.logger.warn("WeatherService: invalid coordinates provided", city);
      return null;
    }
    const cacheKey = this.cacheKey(city.id);
    const ttlMinutes = Math.max(1, cacheMinutes);
    const now = Date.now();
    const expiresAt = this.expiration.get(cacheKey);
    const cached = this.cache.get(cacheKey);
    if (cached && expiresAt && now < expiresAt) {
      return cached;
    }
    let snapshot: WeatherSnapshot | null;
    if (this.provider === "openweathermap") {
      snapshot = await this.fetchFromOpenWeather(city, now);
    } else {
      snapshot = await this.fetchFromOpenMeteo(city, now);
    }
    if (snapshot) {
      this.cache.set(cacheKey, snapshot);
      this.expiration.set(cacheKey, now + ttlMinutes * 60_000);
      return snapshot;
    }
    return cached ?? null;
  }
  clear(): void {
    this.cache.clear();
    this.expiration.clear();
  }
  private cacheKey(cityId: string): string {
    return `${this.provider}:${cityId}`;
  }
  private async fetchFromOpenMeteo(city: CityLocation, now: number): Promise<WeatherSnapshot | null> {
    const url = createOpenMeteoUrl(city);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo response ${response.status}`);
      }
      const data = await response.json() as {
        current?: { temperature_2m?: number; weather_code?: number };
        daily?: { sunrise?: string[]; sunset?: string[] };
        timezone?: string;
      };
      return {
        cityId: city.id,
        fetchedAt: now,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: data?.timezone ?? null,
        timezoneOffsetMinutes: null,
        sunrise: data?.daily?.sunrise?.[0] ?? null,
        sunset: data?.daily?.sunset?.[0] ?? null,
        temperature: typeof data?.current?.temperature_2m === "number" ? data.current.temperature_2m : null,
        weatherCode: typeof data?.current?.weather_code === "number" ? data.current.weather_code : null,
      };
    } catch (error) {
        this.logger.error("WeatherService: failed to fetch from Open-Meteo", city.label, error);
        return null;
    }
  }
  private async fetchFromOpenWeather(city: CityLocation, now: number): Promise<WeatherSnapshot | null> {
    if (!this.apiKey) {
      this.logger.warn("WeatherService: OpenWeatherMap API key is missing", city.label);
      return null;
    }
    const url = createOpenWeatherUrl(city, this.apiKey);
    try {
        const response = await fetch(url);
        if (!response.ok) {
        throw new Error(`OpenWeatherMap response ${response.status}`);
      }
      const data = await response.json() as {
        main?: { temp?: number };
        weather?: Array<{ id?: number }>;
        sys?: { sunrise?: number; sunset?: number };
        timezone?: number;
      };
      const timezoneOffsetSecondsRaw = typeof data?.timezone === "number" ? data.timezone : null;
      const timezoneOffsetMinutes = timezoneOffsetSecondsRaw != null
      ? Math.round(timezoneOffsetSecondsRaw / 60)
        : null;
        const offsetSeconds = timezoneOffsetSecondsRaw ?? 0;
      const sunriseIso = typeof data?.sys?.sunrise === "number"
      ? toLocalIsoString(data.sys.sunrise, offsetSeconds)
        : null;
        const sunsetIso = typeof data?.sys?.sunset === "number"
      ? toLocalIsoString(data.sys.sunset, offsetSeconds)
        : null;
        const wmoCode = mapOpenWeatherToWmo(data?.weather?.[0]?.id);
      return {
        cityId: city.id,
        fetchedAt: now,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: null,
        timezoneOffsetMinutes,
        sunrise: sunriseIso,
        sunset: sunsetIso,
        temperature: typeof data?.main?.temp === "number" ? data.main.temp : null,
        weatherCode: wmoCode,
      };
    } catch (error) {
      this.logger.error("WeatherService: failed to fetch from OpenWeatherMap", city.label, error);
      return null;
    }
  }
}
