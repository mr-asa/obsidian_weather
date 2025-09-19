import { Plugin, WorkspaceLeaf } from "obsidian";

import { CanvasBridge } from "./canvas/canvas-bridge";

import { registerCommands } from "./commands";

import { registerMarkdownWeatherWidget } from "./markdown/weather-codeblock";

import {

  DEFAULT_SETTINGS,

  WEATHER_CATEGORIES,

  TIME_OF_DAY_KEYS,

  type WeatherWidgetSettings,

  type CategoryStyle,

  type CityLocation,

} from "./settings";

import { WeatherSettingsTab } from "./settings-tab";

import { WEATHER_WIDGET_VIEW_TYPE, WeatherWidgetView } from "./ui/weather-widget-view";

import { getLocaleStrings, type LocaleStrings } from "./i18n/strings";

import type { LocaleCode } from "./i18n/types";

import { createId } from "./utils/id";

import { WeatherService, type WeatherSnapshot } from "./services/weather-service";

export default class WeatherPlugin extends Plugin {

  settings: WeatherWidgetSettings;

  private canvasBridge: CanvasBridge | null = null;

  private locale: LocaleCode;

  private strings: LocaleStrings;

  private weatherService: WeatherService;

  private weatherData = new Map<string, WeatherSnapshot>();

  private refreshIntervalId: number | null = null;

  async onload(): Promise<void> {

    this.weatherService = new WeatherService();

    await this.loadSettings();

    this.registerView(WEATHER_WIDGET_VIEW_TYPE, (leaf) => new WeatherWidgetView(leaf, this));

    this.canvasBridge = new CanvasBridge(this);

    registerCommands(this, this.canvasBridge);

    registerMarkdownWeatherWidget(this);

    this.addSettingTab(new WeatherSettingsTab(this.app, this));

    await this.refreshWeatherData();

    this.scheduleWeatherRefresh();

  }

  onunload(): void {

    this.app.workspace.detachLeavesOfType(WEATHER_WIDGET_VIEW_TYPE);

    this.canvasBridge?.unregister();

    if (this.refreshIntervalId !== null) {

      window.clearInterval(this.refreshIntervalId);

      this.refreshIntervalId = null;

    }

    this.weatherService?.clear();

    this.weatherData.clear();

  }

  async activateView(): Promise<void> {

    const { workspace } = this.app;

    const leaves = workspace.getLeavesOfType(WEATHER_WIDGET_VIEW_TYPE);

    let leaf: WorkspaceLeaf;

    if (leaves.length > 0) {

      [leaf] = leaves;

    } else {

      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);

      await leaf.setViewState({ type: WEATHER_WIDGET_VIEW_TYPE, active: true });

    }

    workspace.revealLeaf(leaf);

  }

  requestWidgetRefresh(): void {

    this.app.workspace

      .getLeavesOfType(WEATHER_WIDGET_VIEW_TYPE)

      .forEach((leaf) => {

        const view = leaf.view as unknown as WeatherWidgetView;

        view.refresh();

      });

  }

  getStrings(): LocaleStrings {

    return this.strings;

  }

  getLocale(): LocaleCode {

    return this.locale;

  }

  getWeatherSnapshot(cityId: string): WeatherSnapshot | undefined {

    return this.weatherData.get(cityId);

  }

  private applyLocalization(): void {

    this.locale = this.settings.language;

    this.strings = getLocaleStrings(this.locale);

  }

  private normalizeSettings(): void {

    const defaults = DEFAULT_SETTINGS;

    if (!Array.isArray(this.settings.cities)) {

      this.settings.cities = [];

    }

    this.settings.cities = this.settings.cities.map((city, index) => {

      const legacy = city as Partial<CityLocation> & {

        name?: string;

        label?: string;

      };

      const labelSource = typeof legacy.label === "string" ? legacy.label : legacy.name;

      const label = typeof labelSource === "string" && labelSource.trim().length > 0

        ? labelSource.trim()

        : `City ${index + 1}`;

      const latitude = Number(legacy.latitude);

      const longitude = Number(legacy.longitude);

      return {

        id: legacy.id ?? createId("city"),

        label,

        latitude: Number.isFinite(latitude) ? latitude : 0,

        longitude: Number.isFinite(longitude) ? longitude : 0,

      } as CityLocation;

    });

    if (!Number.isFinite(this.settings.weatherCacheMinutes)) {

      this.settings.weatherCacheMinutes = defaults.weatherCacheMinutes;

    }

    if (!Number.isFinite(this.settings.autoRefreshMinutes)) {

      this.settings.autoRefreshMinutes = defaults.autoRefreshMinutes;

    }

    if (!this.settings.categoryStyles) {

      this.settings.categoryStyles = { ...defaults.categoryStyles };

    }

    WEATHER_CATEGORIES.forEach((category) => {

      const style = this.settings.categoryStyles[category] as Partial<CategoryStyle> | undefined;

      if (!style) {

        this.settings.categoryStyles[category] = { ...defaults.categoryStyles[category] };

        return;

      }

      this.settings.categoryStyles[category] = {

        color: typeof style.color === "string" && style.color.trim().length > 0

          ? style.color.trim()

          : defaults.categoryStyles[category].color,

        icon: typeof style.icon === "string" && style.icon.trim().length > 0

          ? style.icon.trim()

          : defaults.categoryStyles[category].icon,

      };

    });

    if (!this.settings.timeBaseColors) {

      this.settings.timeBaseColors = { ...defaults.timeBaseColors };

    }

    TIME_OF_DAY_KEYS.forEach((key) => {

      const value = this.settings.timeBaseColors[key];

      this.settings.timeBaseColors[key] = typeof value === "string" && value.trim().length > 0

        ? value.trim()

        : defaults.timeBaseColors[key];

    });

    if (!this.settings.timeTintColors) {

      this.settings.timeTintColors = { ...defaults.timeTintColors };

    }

    TIME_OF_DAY_KEYS.forEach((key) => {

      const tint = this.settings.timeTintColors[key];

      this.settings.timeTintColors[key] = typeof tint === "string" && tint.trim().length > 0

        ? tint.trim()

        : defaults.timeTintColors[key];

    });

    if (!this.settings.sunLayer) {

      this.settings.sunLayer = JSON.parse(JSON.stringify(defaults.sunLayer));

    } else {

      const { sunLayer } = this.settings;

      const fallback = defaults.sunLayer;

      sunLayer.colors = sunLayer.colors ?? { ...fallback.colors };

      (Object.keys(fallback.colors) as Array<keyof typeof fallback.colors>).forEach((key) => {

        const value = sunLayer.colors[key];

        sunLayer.colors[key] = typeof value === "string" && value.trim().length > 0

          ? value.trim()

          : fallback.colors[key];

      });

      const applyAlphaDefaults = (

        target: (typeof fallback.alphaDay) | undefined,

        source: typeof fallback.alphaDay,

      ) => ({

        peak: Number.isFinite(target?.peak) ? Number(target?.peak) : source.peak,

        mid: Number.isFinite(target?.mid) ? Number(target?.mid) : source.mid,

        low: Number.isFinite(target?.low) ? Number(target?.low) : source.low,

      });

      sunLayer.alphaDay = applyAlphaDefaults(sunLayer.alphaDay, fallback.alphaDay);

      sunLayer.alphaNight = applyAlphaDefaults(sunLayer.alphaNight, fallback.alphaNight);

      sunLayer.transitionMinutes = Number.isFinite(sunLayer.transitionMinutes)

        ? sunLayer.transitionMinutes

        : fallback.transitionMinutes;

      sunLayer.width = Number.isFinite(sunLayer.width) ? sunLayer.width : fallback.width;

      sunLayer.softnessInner = Number.isFinite(sunLayer.softnessInner) ? sunLayer.softnessInner : fallback.softnessInner;

      sunLayer.softnessOuter = Number.isFinite(sunLayer.softnessOuter) ? sunLayer.softnessOuter : fallback.softnessOuter;

      sunLayer.twilightHighlight = Number.isFinite(sunLayer.twilightHighlight) ? sunLayer.twilightHighlight : fallback.twilightHighlight;

      sunLayer.dayHighlight = Number.isFinite(sunLayer.dayHighlight) ? sunLayer.dayHighlight : fallback.dayHighlight;

      sunLayer.nightHighlight = Number.isFinite(sunLayer.nightHighlight) ? sunLayer.nightHighlight : fallback.nightHighlight;

    }

    if (!this.settings.gradients) {

      this.settings.gradients = JSON.parse(JSON.stringify(defaults.gradients));

    } else {

      const gradients = this.settings.gradients;

      const fallback = defaults.gradients;

      const normalizeTimeBlend = () => {

        const tb = gradients.timeBlend ?? { ...fallback.timeBlend };

        tb.mixRatio = Number.isFinite(tb.mixRatio) ? tb.mixRatio : fallback.timeBlend.mixRatio;

        tb.padding = Number.isFinite(tb.padding) ? tb.padding : fallback.timeBlend.padding;

        tb.widthMin = Number.isFinite(tb.widthMin) ? tb.widthMin : fallback.timeBlend.widthMin;

        tb.widthMax = Number.isFinite(tb.widthMax) ? tb.widthMax : fallback.timeBlend.widthMax;

        tb.peakAlpha = Number.isFinite(tb.peakAlpha) ? tb.peakAlpha : fallback.timeBlend.peakAlpha;

        tb.edgeAlpha = Number.isFinite(tb.edgeAlpha) ? tb.edgeAlpha : fallback.timeBlend.edgeAlpha;

        tb.steps = Number.isFinite(tb.steps) ? tb.steps : fallback.timeBlend.steps;

        tb.power = Number.isFinite(tb.power) ? tb.power : fallback.timeBlend.power;

        gradients.timeBlend = tb;

      };

      const normalizeWeather = () => {

        const w = gradients.weather ?? { ...fallback.weather };

        w.padding = Number.isFinite(w.padding) ? w.padding : fallback.weather.padding;

        w.widthMin = Number.isFinite(w.widthMin) ? w.widthMin : fallback.weather.widthMin;

        w.widthMax = Number.isFinite(w.widthMax) ? w.widthMax : fallback.weather.widthMax;

        w.peakScale = Number.isFinite(w.peakScale) ? w.peakScale : fallback.weather.peakScale;

        w.edgeScale = Number.isFinite(w.edgeScale) ? w.edgeScale : fallback.weather.edgeScale;

        w.steps = Number.isFinite(w.steps) ? w.steps : fallback.weather.steps;

        w.power = Number.isFinite(w.power) ? w.power : fallback.weather.power;

        gradients.weather = w;

      };

      const normalizeTemperature = () => {

        const t = gradients.temperature ?? { ...fallback.temperature };

        t.start = Number.isFinite(t.start) ? t.start : fallback.temperature.start;

        t.end = Number.isFinite(t.end) ? t.end : fallback.temperature.end;

        t.peakAlpha = Number.isFinite(t.peakAlpha) ? t.peakAlpha : fallback.temperature.peakAlpha;

        t.edgeAlpha = Number.isFinite(t.edgeAlpha) ? t.edgeAlpha : fallback.temperature.edgeAlpha;

        t.steps = Number.isFinite(t.steps) ? t.steps : fallback.temperature.steps;

        t.power = Number.isFinite(t.power) ? t.power : fallback.temperature.power;

        gradients.temperature = t;

      };

      normalizeTimeBlend();

      normalizeWeather();

      normalizeTemperature();

    }

    const vf = this.settings.verticalFade ?? { ...defaults.verticalFade };

    vf.top = Number.isFinite(vf.top) ? vf.top : defaults.verticalFade.top;

    vf.middle = Number.isFinite(vf.middle) ? vf.middle : defaults.verticalFade.middle;

    this.settings.verticalFade = vf;

    const lp = this.settings.leftPanel ?? { ...defaults.leftPanel };

    lp.width = Number.isFinite(lp.width) ? lp.width : defaults.leftPanel.width;

    lp.minHighlight = Number.isFinite(lp.minHighlight) ? lp.minHighlight : defaults.leftPanel.minHighlight;

    this.settings.leftPanel = lp;

    const ds = this.settings.daySpan ?? { ...defaults.daySpan };

    ds.min = Number.isFinite(ds.min) ? ds.min : defaults.daySpan.min;

    ds.max = Number.isFinite(ds.max) ? ds.max : defaults.daySpan.max;

    this.settings.daySpan = ds;

    if (!Array.isArray(this.settings.temperatureGradient)) {

      this.settings.temperatureGradient = [...defaults.temperatureGradient];

    } else {

      this.settings.temperatureGradient = this.settings.temperatureGradient

        .map((stop) => ({

          temperature: Number.isFinite(stop.temperature) ? stop.temperature : 0,

          color: typeof stop.color === "string" && stop.color.trim().length > 0

            ? stop.color.trim()

            : defaults.temperatureGradient[0]?.color ?? "#9CA3AF",

        }))

        .sort((a, b) => a.temperature - b.temperature);

    }

    this.settings.showDateWhenDifferent = Boolean(this.settings.showDateWhenDifferent);

  }

  private async loadSettings(): Promise<void> {

    const stored = await this.loadData();

    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});

    this.normalizeSettings();

    this.applyLocalization();

  }

  async saveSettings(): Promise<void> {

    this.normalizeSettings();

    await this.saveData(this.settings);

    this.applyLocalization();

    this.requestWidgetRefresh();

    this.scheduleWeatherRefresh();

    await this.refreshWeatherData();

    this.requestWidgetRefresh();

  }

  private scheduleWeatherRefresh(): void {

    if (this.refreshIntervalId !== null) {

      window.clearInterval(this.refreshIntervalId);

      this.refreshIntervalId = null;

    }

    const refreshMinutes = Math.max(1, this.settings.autoRefreshMinutes);

    const intervalMs = refreshMinutes * 60_000;

    const id = window.setInterval(() => {

      void this.refreshWeatherData();

    }, intervalMs);

    this.refreshIntervalId = id;

    this.registerInterval(id);

  }

  async refreshWeatherData(): Promise<void> {

    if (this.settings.cities.length === 0) {

      this.weatherData.clear();

      return;

    }

    let updated = false;

    for (const city of this.settings.cities) {

      const snapshot = await this.weatherService.refreshCity(city, this.settings.weatherCacheMinutes);

      if (snapshot) {

        this.weatherData.set(city.id, snapshot);

        updated = true;

      }

    }

    if (updated) {

      this.requestWidgetRefresh();

    }

  }

}

