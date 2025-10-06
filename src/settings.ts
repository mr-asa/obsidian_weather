import type { LocaleCode } from "./i18n/types";
import type { AlphaEasingProfile } from "./utils/alpha-gradient";

export type TimeOfDayKey = "morning" | "day" | "evening" | "night";

export type WeatherCategory = "sunny" | "cloudy" | "rainy" | "snowy" | "drizzle" | "storm" | "foggy";

export interface CityLocation {

  id: string;

  label: string;

  latitude: number;

  longitude: number;

}

export interface TemperatureColorStop {

  temperature: number;

  color: string;

}

export interface CategoryStyle {

  color: string;

  icon: string;

}

export type WeatherProviderId = "open-meteo" | "openweathermap";

export interface AlphaGradientSettings {

  profile: AlphaEasingProfile;

  innerOpacityRatio: number;

  opacityScale: number;

  enableLeft: boolean;

  enableRight: boolean;

}

export interface SunIconSettings {

  symbol: string;

  scale: number;

}

export interface SunTransitionWindow {

  before: number;

  after: number;

}

export interface SunColorTransitions {

  sunrise: SunTransitionWindow;

  sunset: SunTransitionWindow;

}

export interface SunAlphaSettings {

  peak: number;

  mid: number;

  low: number;

}

export interface SunLayerSettings {

  colors: {

    night: string;

    sunrise: string;

    day: string;

    sunset: string;

  };

  alphaDay: SunAlphaSettings;

  alphaNight: SunAlphaSettings;

  transitionMinutes: number;

  width: number;

  softnessInner: number;

  softnessOuter: number;

  twilightHighlight: number;

  dayHighlight: number;

  nightHighlight: number;

  alphaProfile: AlphaEasingProfile;

  gradientWidthPercent: number;

  gradientInnerRatio: number;

  gradientOpacity: number;

  icon: SunIconSettings;

  transitions: SunColorTransitions;

}

export interface TimeGradientSettings {

  mixRatio: number;

  padding: number;

  widthMin: number;

  widthMax: number;

  peakAlpha: number;

  edgeAlpha: number;

  steps: number;

  power: number;

}

export interface WeatherGradientSettings {

  padding: number;

  widthMin: number;

  widthMax: number;

  peakScale: number;

  edgeScale: number;

  steps: number;

  power: number;

}

export interface TemperatureGradientSettings {

  start: number;

  end: number;

  peakAlpha: number;

  edgeAlpha: number;

  steps: number;

  power: number;

}

export interface GradientSettings {

  timeBlend: TimeGradientSettings;

  weather: WeatherGradientSettings;

  temperature: TemperatureGradientSettings;

}

export interface VerticalFadeSettings {

  top: number;

  middle: number;

}

export interface LeftPanelSettings {

  width: number;

  minHighlight: number;

}

export interface DaySpanSettings {

  min: number;

  max: number;

}

export interface WeatherWidgetSettings {

  language: LocaleCode;

  cities: CityLocation[];

  weatherCacheMinutes: number;

  autoRefreshMinutes: number;

  weatherProvider: WeatherProviderId;

  weatherProviderApiKey: string;

  weatherProviderApiKeys: Record<WeatherProviderId, string>;

  weatherAlpha: AlphaGradientSettings;

  temperatureAlpha: AlphaGradientSettings;

  categoryStyles: Record<WeatherCategory, CategoryStyle>;

  timeBaseColors: Record<TimeOfDayKey, string>;

  timeTintColors: Record<TimeOfDayKey, string>;

  sunLayer: SunLayerSettings;

  gradients: GradientSettings;

  verticalFade: VerticalFadeSettings;

  leftPanel: LeftPanelSettings;

  daySpan: DaySpanSettings;

  temperatureGradient: TemperatureColorStop[];

  showDateWhenDifferent: boolean;

}

export const WEATHER_CATEGORIES: WeatherCategory[] = [

  "sunny",

  "cloudy",

  "rainy",

  "snowy",

  "drizzle",

  "storm",

  "foggy",

];

export const TIME_OF_DAY_KEYS: TimeOfDayKey[] = [

  "morning",

  "day",

  "evening",

  "night",

];

export const DEFAULT_SETTINGS: WeatherWidgetSettings = {

  language: "ru",

  cities: [],

  weatherCacheMinutes: 60,

  autoRefreshMinutes: 15,

  weatherProvider: "open-meteo",

  weatherProviderApiKey: "",

  weatherProviderApiKeys: {

    "open-meteo": "",

    "openweathermap": "",

  },

  weatherAlpha: {

    profile: "sineInOut",

    innerOpacityRatio: 0.4,

    opacityScale: 0.9,

    enableLeft: true,

    enableRight: true,

  },

  temperatureAlpha: {

    profile: "cubicInOut",

    innerOpacityRatio: 0.5,

    opacityScale: 1,

    enableLeft: true,

    enableRight: true,

  },

  categoryStyles: {

    sunny: { color: "#60a5fa", icon: "☀" },

    cloudy: { color: "#e6e7ce", icon: "☁" },

    rainy: { color: "#6b7280", icon: "🌧" },

    snowy: { color: "#c7d2fe", icon: "❄" },

    drizzle: { color: "#9ca3af", icon: "🌦" },

    storm: { color: "#374151", icon: "⛈" },

    foggy: { color: "#d1d5db", icon: "🌫" },

  },

  timeBaseColors: {
    morning: "#FF8C42",
    day: "#87CEEB",
    evening: "#FF6B6B",
    night: "#162331",
  },
  timeTintColors: {
    morning: "#FBD38D",
    day: "#22D3EE",
    evening: "#F472B6",
    night: "#0F172A",
  },
  sunLayer: {

    colors: {

      night: "#93C5FD",

      sunrise: "#FF4A00",

      day: "#FFD200",

      sunset: "#FF8A3B",

    },

    alphaDay: { peak: 0.9, mid: 0.55, low: 0.22 },

    alphaNight: { peak: 0.3, mid: 0.18, low: 0.08 },

    transitionMinutes: 60,

    width: 9,

    softnessInner: 0.35,

    softnessOuter: 0.65,

    twilightHighlight: 0.24,

    dayHighlight: 0.6,

    nightHighlight: 0.08,

    alphaProfile: "cubicInOut",

    gradientWidthPercent: 60,

    gradientInnerRatio: 0.5,

    gradientOpacity: 0.85,

    icon: { symbol: "◉", scale: 1 },

    transitions: {

      sunrise: { before: 45, after: 45 },

      sunset: { before: 45, after: 45 },

    },

  },

  gradients: {

    timeBlend: {

      mixRatio: 0.35,

      padding: 0.45,

      widthMin: 0.75,

      widthMax: 1.35,

      peakAlpha: 0.32,

      edgeAlpha: 0.08,

      steps: 6,

      power: 1.35,

    },

    weather: {

      padding: 0.18,

      widthMin: 0.65,

      widthMax: 1.25,

      peakScale: 0.96,

      edgeScale: 1.05,

      steps: 7,

      power: 1.08,

    },

    temperature: {

      start: 0.58,

      end: 1,

      peakAlpha: 0.8,

      edgeAlpha: 0.12,

      steps: 6,

      power: 1.05,

    },

  },

  verticalFade: { top: 0.22, middle: 0.08 },

  leftPanel: { width: 34, minHighlight: 0.04 },

  daySpan: { min: 0.12, max: 0.9 },

  temperatureGradient: [

    { temperature: -40, color: "#0B3C91" },

    { temperature: -30, color: "#1E3A8A" },

    { temperature: -20, color: "#2563EB" },

    { temperature: -10, color: "#60A5FA" },

    { temperature: -5, color: "#93C5FD" },

    { temperature: 0, color: "#9CA3AF" },

    { temperature: 5, color: "#CBE1D0" },

    { temperature: 15, color: "#ACDE8B" },

    { temperature: 25, color: "#E3CD81" },

    { temperature: 30, color: "#F8AC75" },

    { temperature: 40, color: "#F37676" },

  ],

  showDateWhenDifferent: true,

};

