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
  type WeatherCategory,
  type WeatherProviderId,
} from "./settings";
import { WeatherSettingsTab } from "./settings-tab";
import { WEATHER_WIDGET_VIEW_TYPE, WeatherWidgetView } from "./ui/weather-widget-view";
import type { WeatherWidget } from "./ui/weather-widget";
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
  private widgetInstances = new Set<WeatherWidget>();
  private refreshIntervalId: number | null = null;
  private widgetMinuteIntervalId: number | null = null;
  private widgetMinuteTimeoutId: number | null = null;
  private lastWidgetMinute: number | null = null;
  private providerSignature: string | null = null;
  private viewRegistered = false;
  async onload(): Promise<void> {
    this.weatherService = new WeatherService();
    await this.loadSettings();
    this.unregisterExistingViewType();
    if (!this.viewRegistered) {
      try {
        this.registerView(WEATHER_WIDGET_VIEW_TYPE, (leaf) => new WeatherWidgetView(leaf, this));
        this.viewRegistered = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Attempting to register an existing view type")) {
          console.warn(
            "WeatherPlugin: view type already registered – continuing without re-registering.",
            error,
          );
          this.viewRegistered = true;
        } else {
          throw error;
        }
      }
    }
    this.canvasBridge = new CanvasBridge(this);
    registerCommands(this, this.canvasBridge);
    registerMarkdownWeatherWidget(this);
    this.addSettingTab(new WeatherSettingsTab(this.app, this));
    await this.refreshWeatherData();
    this.scheduleWeatherRefresh();
    this.scheduleWidgetMinuteUpdates();
  }
  onunload(): void {
    this.app.workspace.detachLeavesOfType(WEATHER_WIDGET_VIEW_TYPE);
    this.canvasBridge?.unregister();
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    if (this.widgetMinuteIntervalId !== null) {
      window.clearInterval(this.widgetMinuteIntervalId);
      this.widgetMinuteIntervalId = null;
    }
    if (this.widgetMinuteTimeoutId !== null) {
      window.clearTimeout(this.widgetMinuteTimeoutId);
      this.widgetMinuteTimeoutId = null;
    }
    this.lastWidgetMinute = null;
    this.weatherService?.clear();
    this.weatherData.clear();
    this.widgetInstances.clear();
    this.unregisterExistingViewType();
    this.viewRegistered = false;
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
  registerWidget(widget: WeatherWidget): void {
        this.widgetInstances.add(widget);
  }
  unregisterWidget(widget: WeatherWidget): void {
        this.widgetInstances.delete(widget);
  }
  requestWidgetRefresh(): void {
    for (const widget of Array.from(this.widgetInstances)) {
      if (!widget.isMounted()) {
        this.widgetInstances.delete(widget);
        continue;
      }
      try {
        widget.update();
      } catch (error) {
        console.error("WeatherPlugin: failed to update widget", error);
      }
    }
  }
  private unregisterExistingViewType(): void {
    const workspace = this.app.workspace as unknown as {
      viewRegistry?: {
        unregisterView?: (type: string) => void;
        viewByType?: Record<string, unknown>;
        typeList?: string[];
      };
    };
    const registry = workspace?.viewRegistry;
    if (!registry) {
      return;
    }
    if (typeof registry.unregisterView === "function") {
      try {
        registry.unregisterView(WEATHER_WIDGET_VIEW_TYPE);
      } catch (error) {
        console.warn("WeatherPlugin: failed to unregister view via API", error);
      }
      return;
    }
    if (registry.viewByType && WEATHER_WIDGET_VIEW_TYPE in registry.viewByType) {
      delete registry.viewByType[WEATHER_WIDGET_VIEW_TYPE];
    }
    if (Array.isArray(registry.typeList)) {
      registry.typeList = registry.typeList.filter((type) => type !== WEATHER_WIDGET_VIEW_TYPE);
    }
  }
  onSettingsTabClosed(): void {
        this.scheduleWidgetMinuteUpdates();
  }
  async resetSettings(): Promise<void> {
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as WeatherWidgetSettings;
    this.lastWidgetMinute = null;
    this.weatherService?.clear();
    this.weatherData.clear();
    await this.saveSettings();
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
  translateWeatherCategory(category: WeatherCategory): string {
        return this.strings.weatherConditions[category] ?? category;
  }
  private applyLocalization(): void {
        this.locale = this.settings.language;
    this.strings = getLocaleStrings(this.locale);
  }
  private computeProviderSignature(provider: WeatherProviderId, apiKey: string): string {
        return `${provider}:${apiKey}`;
  }
  private getActiveProviderApiKey(): string {
        const provider = this.settings.weatherProvider;
    const keys = this.settings.weatherProviderApiKeys ?? {};
    const value = typeof keys[provider] === "string" ? keys[provider] : "";
    return value.trim();
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
    const providerDefaults = DEFAULT_SETTINGS.weatherProviderApiKeys;
    const providerIds = Object.keys(providerDefaults) as WeatherProviderId[];
    if (!providerIds.includes(this.settings.weatherProvider)) {
            this.settings.weatherProvider = DEFAULT_SETTINGS.weatherProvider;
    }
    if (!this.settings.weatherProviderApiKeys || typeof this.settings.weatherProviderApiKeys !== "object") {
            this.settings.weatherProviderApiKeys = { ...providerDefaults };
    }
    const providerKeys = this.settings.weatherProviderApiKeys;
    providerIds.forEach((provider) => {
            const raw = providerKeys[provider];
      providerKeys[provider] = typeof raw === "string" ? raw.trim() : "";
    });
    if (typeof this.settings.weatherProviderApiKey === "string") {
            const legacyKey = this.settings.weatherProviderApiKey.trim();
      this.settings.weatherProviderApiKey = legacyKey;
      const currentProvider = this.settings.weatherProvider;
      if (legacyKey.length > 0 && (!providerKeys[currentProvider] || providerKeys[currentProvider].length === 0)) {
                providerKeys[currentProvider] = legacyKey;
      }
    } else {
            this.settings.weatherProviderApiKey = "";
    }
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
    const timeTransitionDefaults = defaults.timeColorTransitions;
    const normalizeTransition = (
      source: { before?: number; after?: number } | undefined,
      fallback: { before: number; after: number },
    ) => ({
      before: Number.isFinite(source?.before) ? Math.max(0, Math.round(Number(source?.before))) : fallback.before,
      after: Number.isFinite(source?.after) ? Math.max(0, Math.round(Number(source?.after))) : fallback.after,
    });
    const existingTimeTransitions = this.settings.timeColorTransitions;
    this.settings.timeColorTransitions = {
      sunrise: normalizeTransition(existingTimeTransitions?.sunrise, timeTransitionDefaults.sunrise),
      sunset: normalizeTransition(existingTimeTransitions?.sunset, timeTransitionDefaults.sunset),
    };
    const edgePortion = Number(this.settings.gradientEdgePortion);
    const defaultEdgePortion = defaults.gradientEdgePortion ?? 0.25;
    this.settings.gradientEdgePortion = Number.isFinite(edgePortion)
      ? Math.min(Math.max(edgePortion, 0), 0.5)
      : defaultEdgePortion;
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
      const overflowFallback = Number.isFinite(fallback.gradientOverflowPercent)
        ? fallback.gradientOverflowPercent
        : 50;
      const overflowValue = Number(sunLayer.gradientOverflowPercent);
      sunLayer.gradientOverflowPercent = Number.isFinite(overflowValue)
        ? Math.min(Math.max(overflowValue, 0), 200)
        : overflowFallback;
      const icon = sunLayer.icon ?? { ...fallback.icon };
      const symbol = typeof icon.symbol === "string" ? icon.symbol : fallback.icon.symbol;
      const scaleValue = Number(icon.scale);
      const scale = Number.isFinite(scaleValue) ? Math.min(Math.max(scaleValue, 0.1), 5) : fallback.icon.scale;
      sunLayer.icon = {
        symbol,
        scale,
        monospaced: Boolean(icon.monospaced),
      };
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
          }));
      }
    this.settings.showDateWhenDifferent = Boolean(this.settings.showDateWhenDifferent);
    if (typeof this.settings.dateFormat !== "string" || this.settings.dateFormat.trim().length === 0) {
      this.settings.dateFormat = defaults.dateFormat;
    } else {
      this.settings.dateFormat = this.settings.dateFormat.trim();
    }
  }
  private async loadSettings(): Promise<void> {
        const stored = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
    this.normalizeSettings();
    const apiKey = this.getActiveProviderApiKey();
    this.settings.weatherProviderApiKeys[this.settings.weatherProvider] = apiKey;
    this.settings.weatherProviderApiKey = apiKey;
    const nextSignature = this.computeProviderSignature(this.settings.weatherProvider, apiKey);
    const signatureChanged = this.providerSignature !== null && this.providerSignature !== nextSignature;
    this.weatherService?.configureProvider(this.settings.weatherProvider, apiKey);
    if (signatureChanged) {
            this.weatherData.clear();
    }
    this.providerSignature = nextSignature;
    this.applyLocalization();
  }
  async saveSettings(): Promise<void> {
        const previousSignature = this.providerSignature;
    this.normalizeSettings();
    const apiKey = this.getActiveProviderApiKey();
    this.settings.weatherProviderApiKeys[this.settings.weatherProvider] = apiKey;
    this.settings.weatherProviderApiKey = apiKey;
    const nextSignature = this.computeProviderSignature(this.settings.weatherProvider, apiKey);
    this.weatherService.configureProvider(this.settings.weatherProvider, apiKey);
    if (previousSignature !== null && previousSignature !== nextSignature) {
            this.weatherData.clear();
    }
    this.providerSignature = nextSignature;
    await this.saveData(this.settings);
    this.applyLocalization();
    this.requestWidgetRefresh();
    this.scheduleWeatherRefresh();
    this.scheduleWidgetMinuteUpdates();
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
      this.refreshWeatherData().catch((error) => {
        console.error("WeatherPlugin: failed to refresh weather data", error);
      });
    }, intervalMs);
    this.refreshIntervalId = id;
    this.registerInterval(id);
  }
  private scheduleWidgetMinuteUpdates(): void {
    if (this.widgetMinuteTimeoutId !== null) {
      window.clearTimeout(this.widgetMinuteTimeoutId);
      this.widgetMinuteTimeoutId = null;
    }
    if (this.widgetMinuteIntervalId !== null) {
      window.clearInterval(this.widgetMinuteIntervalId);
      this.widgetMinuteIntervalId = null;
    }
    const runTick = (force = false) => {
      try {
        this.handleWidgetMinuteTick(force);
      } catch (error) {
        console.error("WeatherPlugin: widget minute tick failed", error);
      }
    };
    const startInterval = () => {
      const id = window.setInterval(() => {
        runTick();
      }, 60_000);
      this.widgetMinuteIntervalId = id;
      this.registerInterval(id);
    };
    runTick(true);
    const now = Date.now();
    const nextMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
    const delay = Math.max(0, nextMinute - now);
    this.widgetMinuteTimeoutId = window.setTimeout(() => {
      this.widgetMinuteTimeoutId = null;
      runTick();
      startInterval();
    }, delay);
  }
  
  private handleWidgetMinuteTick(force = false): void {
    
    const now = new Date();
    
    const currentMinute = now.getMinutes();
    
    if (!force && this.lastWidgetMinute === currentMinute) {
      
      return;
      
    }
    
    this.lastWidgetMinute = currentMinute;
    
    this.requestWidgetRefresh();
    
  }
  
  
  async refreshWeatherData(): Promise<void> {
        if (this.settings.cities.length === 0) {
            const hadData = this.weatherData.size > 0;
      this.weatherData.clear();
      if (hadData) {
                this.requestWidgetRefresh();
      }
      return;
    }
    let updated = false;
    const activeCityIds = new Set<string>();
    for (const city of this.settings.cities) {
            activeCityIds.add(city.id);
      const snapshot = await this.weatherService.refreshCity(city, this.settings.weatherCacheMinutes);
      if (snapshot) {
                this.weatherData.set(city.id, snapshot);
        updated = true;
      } else if (this.weatherData.delete(city.id)) {
                updated = true;
      }
    }
    for (const existingCityId of Array.from(this.weatherData.keys())) {
            if (!activeCityIds.has(existingCityId)) {
                this.weatherData.delete(existingCityId);
        updated = true;
      }
    }
    if (updated) {
            this.requestWidgetRefresh();
    }
  }
}
