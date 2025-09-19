import type { CityLocation } from "../settings";

export interface WeatherSnapshot {

  cityId: string;

  fetchedAt: number;

  latitude: number;

  longitude: number;

  timezone: string | null;

  sunrise: string | null;

  sunset: string | null;

  temperature: number | null;

  weatherCode: number | null;

}

const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

function createWeatherUrl(city: CityLocation): string {

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

export class WeatherService {

  private cache = new Map<string, WeatherSnapshot>();

  private expiration = new Map<string, number>();

  constructor(private readonly logger: Console = console) {}

  getSnapshot(cityId: string): WeatherSnapshot | undefined {

    const snapshot = this.cache.get(cityId);

    if (!snapshot) {

      return undefined;

    }

    const expiresAt = this.expiration.get(cityId);

    if (expiresAt && Date.now() > expiresAt) {

      this.cache.delete(cityId);

      this.expiration.delete(cityId);

      return undefined;

    }

    return snapshot;

  }

  async refreshCity(city: CityLocation, cacheMinutes: number): Promise<WeatherSnapshot | null> {

    if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) {

      this.logger.warn("WeatherService: invalid coordinates provided", city);

      return null;

    }

    const ttlMinutes = Math.max(1, cacheMinutes);

    const now = Date.now();

    const expiresAt = this.expiration.get(city.id);

    const cached = this.cache.get(city.id);

    if (cached && expiresAt && now < expiresAt) {

      return cached;

    }

    const url = createWeatherUrl(city);

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

      const snapshot: WeatherSnapshot = {

        cityId: city.id,

        fetchedAt: now,

        latitude: city.latitude,

        longitude: city.longitude,

        timezone: data?.timezone ?? null,

        sunrise: data?.daily?.sunrise?.[0] ?? null,

        sunset: data?.daily?.sunset?.[0] ?? null,

        temperature: typeof data?.current?.temperature_2m === "number" ? data.current.temperature_2m : null,

        weatherCode: typeof data?.current?.weather_code === "number" ? data.current.weather_code : null,

      };

      this.cache.set(city.id, snapshot);

      this.expiration.set(city.id, now + ttlMinutes * 60_000);

      return snapshot;

    } catch (error) {

      this.logger.error("WeatherService: failed to fetch", city.label, error);

      if (cached) {

        return cached;

      }

      return null;

    }

  }

  clear(): void {

    this.cache.clear();

    this.expiration.clear();

  }

}

