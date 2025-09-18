import type { LocaleCode } from "./i18n/types";

export type SunCycleKey = "morning" | "day" | "evening" | "night";

export type SunCycleColors = Record<SunCycleKey, string>;

export type WeatherConditionKey =
  | "clear"
  | "partlyCloudy"
  | "cloudy"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "fog";

export type WeatherConditionPalette = Record<WeatherConditionKey, string>;

export interface CityLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface TemperatureColorStop {
  temperature: number;
  color: string;
}

export interface WeatherWidgetSettings {
  language: LocaleCode;
  apiKey: string;
  cities: CityLocation[];
  sunCycleColors: SunCycleColors;
  sunCycleBackgrounds: SunCycleColors;
  sunGradientWidthPercent: number;
  weatherConditionPalette: WeatherConditionPalette;
  temperatureGradient: TemperatureColorStop[];
}

export const DEFAULT_SETTINGS: WeatherWidgetSettings = {
  language: "ru",
  apiKey: "",
  cities: [],
  sunCycleColors: {
    morning: "#FFE2A7",
    day: "#87CEEB",
    evening: "#FFB347",
    night: "#1C1F33",
  },
  sunCycleBackgrounds: {
    morning: "#FFF5E1",
    day: "#E7F6FF",
    evening: "#FFE3C4",
    night: "#10131F",
  },
  sunGradientWidthPercent: 9,
  weatherConditionPalette: {
    clear: "#FFD166",
    partlyCloudy: "#A7C7E7",
    cloudy: "#778899",
    rain: "#4C6EF5",
    thunderstorm: "#6C2BD9",
    snow: "#E0F7FF",
    fog: "#BFC6D0",
  },
  temperatureGradient: [
    { temperature: -20, color: "#3366FF" },
    { temperature: 0, color: "#87CEEB" },
    { temperature: 20, color: "#FFD580" },
    { temperature: 35, color: "#FF5722" },
  ],
};
