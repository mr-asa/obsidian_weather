import { App, PluginSettingTab, Setting } from "obsidian";
import type WeatherPlugin from "./main";
import type { LocaleStrings } from "./i18n/strings";
import type { LocaleCode } from "./i18n/types";
import {
    DEFAULT_SETTINGS,
  WEATHER_CATEGORIES,
  TIME_OF_DAY_KEYS,
  type CityLocation,
  type WeatherCategory,
  type TemperatureColorStop,
  type TimeOfDayKey,
  type WeatherProviderId,
} from "./settings";
import { clamp, lerp, normalize } from "./utils/math";
import { ensureHex, lerpColorGamma, rgba } from "./utils/color";
import { DEFAULT_ALPHA_EASING_PROFILE, type AlphaEasingProfile } from "./utils/alpha-gradient";
import { computeSolarAltitude } from "./utils/solar";
import { buildSunOverlayState, computeGradientLayers } from "./utils/widget-render";
import { createId } from "./utils/id";
const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;
const PROVIDER_META: Record<WeatherProviderId, { requiresKey: boolean }> = {
    "open-meteo": { requiresKey: false },
  "openweathermap": { requiresKey: true },
};
const TEMP_MIN = -80;
const TEMP_MAX = 80;
const PREVIEW_DAY_START = 0.3;
const PREVIEW_DAY_SPAN = 0.4;
const MINUTES_IN_DAY = 1_440;
const SECONDS_IN_DAY = 86_400;
const MS_PER_MINUTE = 60_000;
const PREVIEW_LATITUDE = 55.7558;
const PREVIEW_LONGITUDE = 37.6176;
const PREVIEW_TIMEZONE_OFFSET = 180;
const PREVIEW_TIME_EMOJIS: Record<TimeOfDayKey, string> = {
  morning: "🌅",
  day: "🌞",
  evening: "🌇",
  night: "🌙",
};
const PREVIEW_FALLBACK_ICON = "☁";
const ALPHA_PROFILE_OPTIONS: readonly AlphaEasingProfile[] = [
    "sineIn",
  "sineOut",
  "sineInOut",
  "quadIn",
  "quadOut",
  "quadInOut",
  "cubicIn",
  "cubicOut",
  "cubicInOut",
  "circIn",
  "circOut",
  "circInOut",
];
function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function shiftedDateByOffset(date: Date, targetOffsetMin: number): Date {
  const localOffset = -date.getTimezoneOffset();
  const delta = targetOffsetMin - localOffset;
  return new Date(date.getTime() + delta * MS_PER_MINUTE);
}

function tempToColorSample(temperature: number, stops: TemperatureColorStop[]): string {
  if (stops.length === 0) {
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
      return lerpColorGamma(ensureHex(current.color, "#9ca3af"), ensureHex(next.color, "#9ca3af"), factor);
    }
  }
  return ensureHex(sorted[0].color, "#9ca3af");
}
export class WeatherSettingsTab extends PluginSettingTab {
    private readonly plugin: WeatherPlugin;
  private sampleTimeMinutes = 720;
  private sampleTemperature = 20;
  private sampleWeatherCategory: WeatherCategory = "sunny";
  private previewRow?: HTMLDivElement;
  private previewOverlay?: HTMLDivElement;
  private previewSunIconEl?: HTMLSpanElement;
  private previewTimeIconEl?: HTMLElement;
  private previewTimeTextEl?: HTMLElement;
  private previewDateEl?: HTMLElement;
  private previewWeatherIconEl?: HTMLElement;
  private previewWeatherTextEl?: HTMLElement;
  private previewTemperatureEl?: HTMLElement;
  private gradientPreviewEl?: HTMLDivElement;
  private updateTimeGradientPreview?: () => void;
  private updateWeatherGradientPreview?: () => void;
  private updateTemperatureGradientPreview?: () => void;
  private temperatureTableBody?: HTMLTableSectionElement;
  private latestStrings?: LocaleStrings;
  constructor(app: App, plugin: WeatherPlugin) {
        super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
        const { containerEl } = this;
    containerEl.empty();
    this.temperatureTableBody = undefined;
    const strings = this.plugin.getStrings();
    this.latestStrings = strings;
    this.renderLocalizationSection(containerEl, strings);
    this.renderWidgetUpdatesSection(containerEl, strings);
    this.renderLocationsSection(containerEl, strings);
    this.renderGradientPreviewSection(containerEl, strings);
    const collapsibleRoot = containerEl.createDiv({ cls: "weather-settings__collapsible-group" });
    this.renderCollapsibleSection(collapsibleRoot, strings.settings.timePalette.heading, strings.settings.timePalette.description, (body) => {
            this.renderTimePaletteContent(body, strings);
    });
    this.renderCollapsibleSection(collapsibleRoot, strings.settings.sunLayer.heading, strings.settings.sunLayer.description, (body) => {
            this.renderSunLayerContent(body, strings);
    });
    this.renderCollapsibleSection(collapsibleRoot, strings.settings.weatherLayer.heading, strings.settings.weatherLayer.description, (body) => {
            this.renderWeatherPaletteContent(body, strings);
    });
    this.renderCollapsibleSection(collapsibleRoot, strings.settings.temperatureLayer.heading, strings.settings.temperatureLayer.description, (body) => {
            this.renderTemperatureGradientContent(body, strings);
    });
    this.renderOtherSection(containerEl, strings);
  }
  private renderLocalizationSection(containerEl: HTMLElement, strings: LocaleStrings): void {
        const section = containerEl.createDiv({ cls: "weather-settings__section" });
    section.createEl("h3", { text: strings.settings.localization.heading });
    new Setting(section)
    .setName(strings.settings.localization.languageLabel)
      .setDesc(strings.settings.localization.languageDescription)
      .addDropdown((dropdown) => {
                (Object.keys(strings.languageNames) as LocaleCode[]).forEach((code) => {
                    dropdown.addOption(code, strings.languageNames[code]);
        });
        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange(async (value) => {
                    this.plugin.settings.language = value as LocaleCode;
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
  private renderWidgetUpdatesSection(containerEl: HTMLElement, strings: LocaleStrings): void {
        const section = containerEl.createDiv({ cls: "weather-settings__section" });
    section.createEl("h3", { text: strings.settings.widgetUpdates.heading });
    section.createEl("p", { text: strings.settings.widgetUpdates.description, cls: "weather-settings__hint weather-settings__hint--compact" });
    const rowSetting = new Setting(section);
    rowSetting.infoEl.remove();
    rowSetting.settingEl.addClass("weather-settings__widget-update");
    const control = rowSetting.controlEl;
    const providerLinks = strings.settings.widgetUpdates.providerLinks ?? {};
    const providerNames = strings.settings.widgetUpdates.providerOptions ?? {};
    const leftColumn = control.createDiv({ cls: "weather-settings__widget-update-left" });
    const providerLabel = leftColumn.createEl("label", { cls: "weather-settings__field" });
    const providerHeader = providerLabel.createDiv({ cls: "weather-settings__field-header" });
    providerHeader.createSpan({ text: strings.settings.widgetUpdates.providerLabel });
    const providerLinkEl = providerHeader.createEl("a", {
      cls: "weather-settings__provider-link",
      text: strings.settings.widgetUpdates.providerLinkLabel,
      attr: { href: "#", target: "_blank", rel: "noopener noreferrer" },
    });
    const providerSelect = providerLabel.createEl("select");
    Object.entries(strings.settings.widgetUpdates.providerOptions).forEach(([value, label]) => {
            providerSelect.createEl("option", { value, text: label });
    });
    providerSelect.value = this.plugin.settings.weatherProvider;
    providerLabel.createSpan({ cls: "weather-settings__hint weather-settings__hint--compact", text: strings.settings.widgetUpdates.providerHint });
    const apiLabel = leftColumn.createEl("label", { cls: "weather-settings__field" });
    apiLabel.createSpan({ text: strings.settings.widgetUpdates.apiKeyLabel });
    const apiInput = apiLabel.createEl("input", {
      attr: { type: "text", placeholder: strings.settings.widgetUpdates.apiKeyPlaceholder },
    });
    const apiHint = apiLabel.createEl("span", { cls: "weather-settings__hint weather-settings__hint--compact" });

    const ensureProviderKeyMap = (): Record<string, string> => {
      if (!this.plugin.settings.weatherProviderApiKeys || typeof this.plugin.settings.weatherProviderApiKeys !== "object") {
        this.plugin.settings.weatherProviderApiKeys = { ...DEFAULT_SETTINGS.weatherProviderApiKeys };
      }
      return this.plugin.settings.weatherProviderApiKeys;
    };

    let activeProvider = this.plugin.settings.weatherProvider as WeatherProviderId;

    const persistActiveProviderKey = () => {
      const keys = ensureProviderKeyMap();
      const sanitized = apiInput.disabled ? "" : apiInput.value.trim();
      apiInput.value = sanitized;
      keys[activeProvider] = sanitized;
      if (activeProvider === (this.plugin.settings.weatherProvider as WeatherProviderId)) {
        this.plugin.settings.weatherProviderApiKey = sanitized;
      }
    };

    const updateProviderLink = (provider: WeatherProviderId) => {
      const href = providerLinks[provider];
      if (href && href.trim().length > 0) {
        providerLinkEl.setAttr("href", href);
        const providerName = providerNames[provider] ?? provider;
        providerLinkEl.setAttr("aria-label", `${strings.settings.widgetUpdates.providerLinkLabel} — ${providerName}`);
        providerLinkEl.removeClass("is-hidden");
      } else {
        providerLinkEl.addClass("is-hidden");
      }
    };

    const applyProviderState = () => {
      const provider = this.plugin.settings.weatherProvider as WeatherProviderId;
      activeProvider = provider;
      providerSelect.value = provider;
      updateProviderLink(provider);

      const meta = PROVIDER_META[provider] ?? { requiresKey: false };
      const keys = ensureProviderKeyMap();
      let storedValue = typeof keys[provider] === "string" ? keys[provider] : "";
      storedValue = storedValue.trim();
      if (!meta.requiresKey && storedValue.length > 0) {
        storedValue = "";
        keys[provider] = "";
      } else {
        keys[provider] = storedValue;
      }
      this.plugin.settings.weatherProviderApiKey = storedValue;
      apiInput.value = storedValue;
      apiInput.disabled = !meta.requiresKey;
      apiInput.required = meta.requiresKey;
      apiLabel.classList.toggle("is-hidden", !meta.requiresKey);

      const descriptions = strings.settings.widgetUpdates.apiKeyDescriptions ?? {};
      const description = descriptions[provider] ?? "";
      apiHint.textContent = description;
      apiHint.classList.toggle("is-hidden", description.trim().length === 0 || !meta.requiresKey);
    };

    providerSelect.addEventListener("change", async (event) => {
            const target = event.target as HTMLSelectElement;
      persistActiveProviderKey();
      const nextProvider = target.value as WeatherProviderId;
      this.plugin.settings.weatherProvider = nextProvider;
      ensureProviderKeyMap();
      const nextValue = this.plugin.settings.weatherProviderApiKeys?.[nextProvider] ?? "";
      this.plugin.settings.weatherProviderApiKey = nextValue;
      applyProviderState();
      await this.plugin.saveSettings();
      await this.plugin.refreshWeatherData();
    });

    apiInput.addEventListener("change", async () => {
            if (apiInput.disabled) {
                return;
      }
      apiInput.value = apiInput.value.trim();
      persistActiveProviderKey();
      await this.plugin.saveSettings();
    });

    applyProviderState();
    const rightColumn = control.createDiv({ cls: "weather-settings__widget-update-right" });
    const intervalLabel = rightColumn.createEl("label", { cls: "weather-settings__field" });
    intervalLabel.createSpan({ text: strings.settings.widgetUpdates.intervalLabel });
    const intervalInput = intervalLabel.createEl("input", { attr: { type: "number", min: "1", step: "1" } });
    intervalLabel.createSpan({ cls: "weather-settings__hint weather-settings__hint--compact", text: strings.settings.widgetUpdates.intervalHint });
    intervalInput.value = String(this.plugin.settings.weatherCacheMinutes);
    const commitInterval = () => {
            const parsed = Number(intervalInput.value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
                intervalInput.value = String(this.plugin.settings.weatherCacheMinutes);
        return;
      }
      const normalized = Math.max(1, Math.round(parsed));
      this.plugin.settings.weatherCacheMinutes = normalized;
      this.plugin.settings.autoRefreshMinutes = normalized;
      intervalInput.value = String(normalized);
      void this.plugin.saveSettings();
    };
    intervalInput.addEventListener("change", commitInterval);
    intervalInput.addEventListener("blur", commitInterval);
    intervalInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
        commitInterval();
        intervalInput.blur();
      }
    });
  }
  private renderLocationsSection(containerEl: HTMLElement, strings: LocaleStrings): void {
        const section = containerEl.createDiv({ cls: "weather-settings__section" });
    section.createEl("h3", { text: strings.settings.locations.heading });
    section.createEl("p", { text: strings.settings.locations.description, cls: "weather-settings__hint" });
    const table = section.createEl("table", { cls: "weather-settings__table" });
    const headRow = table.createTHead().insertRow();
    [
            strings.settings.locations.tableHeaders.label,
      strings.settings.locations.tableHeaders.latitude,
      strings.settings.locations.tableHeaders.longitude,
      strings.settings.locations.tableHeaders.actions,
    ].forEach((header) => {
            headRow.appendChild(document.createElement("th")).textContent = header;
    });
    const body = table.createTBody();
    if (this.plugin.settings.cities.length === 0) {
            const emptyRow = body.insertRow();
      const cell = emptyRow.insertCell();
      cell.colSpan = 4;
      cell.className = "weather-settings__empty";
      cell.textContent = strings.settings.locations.emptyState;
    } else {
            this.plugin.settings.cities.forEach((city, index) => {
                const row = body.insertRow();
        this.renderCityRow(row, city, index, strings);
      });
    }
    new Setting(section)
    .addButton((button) => {
                button
        .setButtonText(strings.settings.locations.addButtonLabel)
          .onClick(() => {
                        this.plugin.settings.cities.push({
                            id: createId("city"),
              label: strings.settings.locations.defaultLabel,
              latitude: 0,
              longitude: 0,
            });
            void this.plugin.saveSettings();
            this.display();
          });
        });
    }
  private renderCityRow(row: HTMLTableRowElement, city: CityLocation, index: number, strings: LocaleStrings): void {
        const labelCell = row.insertCell();
    const labelInput = labelCell.createEl("input", { cls: "weather-settings__table-input", attr: { type: "text" } });
    labelInput.value = city.label;
    const commitLabel = () => {
            const list = this.plugin.settings.cities;
      const target = list[index];
      if (!target) {
                return;
      }
      const value = labelInput.value.trim();
      if (target.label === value) {
                labelInput.value = target.label;
        return;
      }
      target.label = value;
      city.label = value;
      void this.plugin.saveSettings().then(() => {
                const latest = this.plugin.settings.cities[index];
        if (latest) {
                    labelInput.value = latest.label;
        }
      });
    };
    labelInput.addEventListener("change", commitLabel);
    labelInput.addEventListener("blur", commitLabel);
    labelInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
        commitLabel();
        labelInput.blur();
      }
    });
    this.renderCoordinateCell(row, city, index, "latitude", LAT_MIN, LAT_MAX);
    this.renderCoordinateCell(row, city, index, "longitude", LON_MIN, LON_MAX);
    const actionsCell = row.insertCell();
    actionsCell.className = "weather-settings__table-actions";
    const up = actionsCell.createEl("button", {
            cls: "weather-settings__table-button weather-settings__table-button--icon",
      text: "↑",
    });
    up.disabled = index === 0;
    up.addEventListener("click", () => {
            this.swapCities(index, index - 1);
    });
    const down = actionsCell.createEl("button", {
            cls: "weather-settings__table-button weather-settings__table-button--icon",
      text: "↓",
    });
    down.disabled = index === this.plugin.settings.cities.length - 1;
    down.addEventListener("click", () => {
            this.swapCities(index, index + 1);
    });
    const remove = actionsCell.createEl("button", {
            cls: "weather-settings__table-button",
      text: strings.actions.remove,
    });
    remove.addEventListener("click", () => {
            this.plugin.settings.cities.splice(index, 1);
      void this.plugin.saveSettings();
      this.display();
    });
  }
  private renderCoordinateCell(
        row: HTMLTableRowElement,
    city: CityLocation,
    index: number,
    key: "latitude" | "longitude",
    min: number,
    max: number,
  ): void {
        const cell = row.insertCell();
    const input = cell.createEl("input", {
            cls: "weather-settings__table-input",
      attr: { type: "number", step: "0.0001" },
    });
    input.value = String(city[key]);
    const commitValue = (raw: string) => {
            const sanitized = raw.replace(/,/g, ".").trim();
      if (sanitized === "" || sanitized === "-" || sanitized === "+") {
                return;
      }
      const parsed = Number(sanitized);
      if (!Number.isFinite(parsed)) {
                return;
      }
      const clamped = Math.max(min, Math.min(max, parsed));
      const list = this.plugin.settings.cities;
      const target = list[index];
      if (!target) {
                return;
      }
      target[key] = clamped;
      city[key] = clamped;
      input.value = String(clamped);
      void this.plugin.saveSettings();
    };
    input.addEventListener("input", () => {
            commitValue(input.value);
    });
    input.addEventListener("change", () => {
            commitValue(input.value);
    });
  }
  private swapCities(source: number, target: number): void {
        const list = this.plugin.settings.cities;
    if (target < 0 || target >= list.length) {
            return;
    }
    [list[source], list[target]] = [list[target], list[source]];
    void this.plugin.saveSettings();
    this.display();
  }
  private renderTimePaletteContent(parent: HTMLElement, strings: LocaleStrings): void {
        const grid = parent.createDiv({ cls: "weather-settings__color-grid" });
    TIME_OF_DAY_KEYS.forEach((phase) => {
            const setting = new Setting(grid).setName(strings.sunPhases[phase]);
      setting.addColorPicker((picker) =>
        picker
        .setValue(this.plugin.settings.timeBaseColors[phase])
          .onChange((value) => {
                        this.plugin.settings.timeBaseColors[phase] = value;
            void this.plugin.saveSettings();
            this.updateTimeGradientPreview?.();
            this.refreshPreviewRow();
          }));
        });
  }
  private renderWeatherPaletteContent(parent: HTMLElement, strings: LocaleStrings): void {
        const grid = parent.createDiv({ cls: "weather-settings__color-grid" });
    WEATHER_CATEGORIES.forEach((category) => {
            new Setting(grid)
      .setName(strings.weatherConditions[category])
        .addColorPicker((picker) =>
          picker
          .setValue(this.plugin.settings.categoryStyles[category].color)
            .onChange((value) => {
                            this.plugin.settings.categoryStyles[category].color = value;
              void this.plugin.saveSettings();
              this.updateWeatherGradientPreview?.();
              this.updateTimeGradientPreview?.();
              this.refreshGradientPreview();
              this.refreshPreviewRow();
            }))
            .addText((text) => {
                    text.inputEl.maxLength = 5;
          text.inputEl.size = 5;
          text.inputEl.classList.add("weather-settings__icon-input");
          text.setValue(this.plugin.settings.categoryStyles[category].icon);
          text.onChange((value) => {
                        this.plugin.settings.categoryStyles[category].icon = value.trim() || DEFAULT_SETTINGS.categoryStyles[category].icon;
            void this.plugin.saveSettings();
            this.refreshPreviewRow();
          });
        });
      });
    const weatherAlpha = this.plugin.settings.weatherAlpha;
    this.addAlphaProfileSetting(parent, strings.settings.weatherLayer.alphaProfileLabel, weatherAlpha.profile, strings, (value) => {
            weatherAlpha.profile = value;
    });
    this.addNumberSetting(parent, strings.settings.weatherLayer.innerWidthLabel, weatherAlpha.innerOpacityRatio, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      weatherAlpha.innerOpacityRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.weatherLayer.opacityScaleLabel, weatherAlpha.opacityScale, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      weatherAlpha.opacityScale = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    new Setting(parent)
    .setName(strings.settings.weatherLayer.disableLeftLabel)
      .addToggle((toggle) => {
                toggle.setValue(!weatherAlpha.enableLeft);
        toggle.onChange((value) => {
                    weatherAlpha.enableLeft = !value;
          void this.plugin.saveSettings();
          this.refreshGradientPreview();
          this.refreshPreviewRow();
        });
      });
    }
  private renderTemperatureGradientContent(parent: HTMLElement, strings: LocaleStrings): void {
        const table = parent.createEl("table", { cls: "weather-settings__table" });
    const head = table.createTHead().insertRow();
    head.appendChild(document.createElement("th")).textContent = strings.settings.temperatureLayer.tableHeaders.temperature;
    head.appendChild(document.createElement("th")).textContent = strings.settings.temperatureLayer.tableHeaders.color;
    head.appendChild(document.createElement("th")).textContent = strings.settings.locations.tableHeaders.actions;
    this.temperatureTableBody = table.createTBody();
    this.renderTemperatureTableRows(strings);
    new Setting(parent)
    .addButton((button) => {
                button
        .setButtonText(strings.settings.temperatureLayer.addButtonLabel)
          .onClick(() => {
                        const fallback = DEFAULT_SETTINGS.temperatureGradient[DEFAULT_SETTINGS.temperatureGradient.length - 1];
            this.plugin.settings.temperatureGradient.push({
                            temperature: fallback.temperature,
              color: fallback.color,
            });
            this.persistTemperatureGradient();
            this.refreshTemperatureTable();
          });
        });
      const temperatureAlpha = this.plugin.settings.temperatureAlpha;
    this.addAlphaProfileSetting(parent, strings.settings.temperatureLayer.alphaProfileLabel, temperatureAlpha.profile, strings, (value) => {
            temperatureAlpha.profile = value;
    });
    this.addNumberSetting(parent, strings.settings.temperatureLayer.innerWidthLabel, temperatureAlpha.innerOpacityRatio, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      temperatureAlpha.innerOpacityRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.temperatureLayer.opacityScaleLabel, temperatureAlpha.opacityScale, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      temperatureAlpha.opacityScale = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    new Setting(parent)
    .setName(strings.settings.temperatureLayer.disableRightLabel)
      .addToggle((toggle) => {
                toggle.setValue(!temperatureAlpha.enableRight);
        toggle.onChange((value) => {
                    temperatureAlpha.enableRight = !value;
          void this.plugin.saveSettings();
          this.refreshGradientPreview();
          this.refreshPreviewRow();
        });
      });
    }
  private renderTemperatureTableRows(strings: LocaleStrings): void {
        const body = this.temperatureTableBody;
    if (!body) {
            return;
    }
    body.replaceChildren();
    this.plugin.settings.temperatureGradient.forEach((stop, index) => {
            const row = body.insertRow();
      this.renderTemperatureRow(row, stop, index, strings);
    });
  }
  private refreshTemperatureTable(): void {
        if (!this.temperatureTableBody || !this.latestStrings) {
            return;
    }
    this.renderTemperatureTableRows(this.latestStrings);
  }
  private renderTemperatureRow(row: HTMLTableRowElement, stop: TemperatureColorStop, index: number, strings: LocaleStrings): void {
        const tempCell = row.insertCell();
    const tempInput = tempCell.createEl("input", {
            cls: "weather-settings__table-input",
      attr: { type: "number", step: "1" },
    });
    tempInput.value = String(stop.temperature);
    const getTargetStop = () => this.plugin.settings.temperatureGradient[index] ?? stop;
    const resetTemperatureInput = () => {
            const target = getTargetStop();
      tempInput.value = String(target.temperature);
    };
    const commitTemperature = () => {
            const parsed = Number(tempInput.value.trim());
      if (!Number.isFinite(parsed)) {
                resetTemperatureInput();
        return;
      }
      const clamped = Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(parsed)));
      const target = getTargetStop();
      if (target.temperature === clamped) {
                resetTemperatureInput();
        return;
      }
      target.temperature = clamped;
      stop.temperature = clamped;
      tempInput.value = String(clamped);
      this.persistTemperatureGradient();
    };
    tempInput.addEventListener("change", commitTemperature);
    tempInput.addEventListener("blur", commitTemperature);
    tempInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
        commitTemperature();
        tempInput.blur();
      }
    });
    const colorCell = row.insertCell();
    const colorInput = colorCell.createEl("input", {
            cls: "weather-settings__table-input weather-settings__table-input--color",
      attr: { type: "color" },
    });
    colorInput.value = stop.color;
    colorInput.addEventListener("input", () => {
            const target = getTargetStop();
      target.color = colorInput.value;
      stop.color = target.color;
      this.persistTemperatureGradient();
    });
    const actionsCell = row.insertCell();
    actionsCell.className = "weather-settings__table-actions";
    const up = actionsCell.createEl("button", {
            cls: "weather-settings__table-button weather-settings__table-button--icon",
      text: "↑",
    });
    up.disabled = index === 0;
    up.addEventListener("click", () => this.moveTemperatureStop(index, -1));
    const down = actionsCell.createEl("button", {
            cls: "weather-settings__table-button weather-settings__table-button--icon",
      text: "↓",
    });
    down.disabled = index === this.plugin.settings.temperatureGradient.length - 1;
    down.addEventListener("click", () => this.moveTemperatureStop(index, 1));
    const remove = actionsCell.createEl("button", {
            cls: "weather-settings__table-button",
      text: strings.actions.remove,
    });
    remove.addEventListener("click", () => {
            this.plugin.settings.temperatureGradient.splice(index, 1);
      this.persistTemperatureGradient();
      this.refreshTemperatureTable();
    });
  }
  private persistTemperatureGradient(): void {
        void this.plugin.saveSettings();
    this.updateTemperatureGradientPreview?.();
    this.refreshGradientPreview();
    this.refreshPreviewRow();
  }
  private moveTemperatureStop(index: number, offset: number): void {
        const target = index + offset;
    if (target < 0 || target >= this.plugin.settings.temperatureGradient.length) {
            return;
    }
    const list = this.plugin.settings.temperatureGradient;
    [list[index], list[target]] = [list[target], list[index]];
    this.persistTemperatureGradient();
    this.refreshTemperatureTable();
  }
  private renderSunLayerContent(parent: HTMLElement, strings: LocaleStrings): void {
        const sunLayer = this.plugin.settings.sunLayer;
    const colorRow = parent.createDiv({ cls: "weather-settings__sun-colors" });
    (["night", "sunrise", "day", "sunset"] as const).forEach((key) => {
            const block = colorRow.createDiv({ cls: "weather-settings__sun-color" });
      block.createSpan({ cls: "weather-settings__sun-color-label", text: strings.settings.sunLayer.colors[key] });
      const input = block.createEl("input", { cls: "weather-settings__sun-color-input", attr: { type: "color" } });
      input.value = sunLayer.colors[key];
      input.addEventListener("input", () => {
                sunLayer.colors[key] = input.value;
        void this.plugin.saveSettings();
        this.refreshPreviewRow();
      });
    });
    this.addAlphaProfileSetting(parent, strings.settings.sunLayer.alphaProfileLabel, sunLayer.alphaProfile, strings, (value) => {
            sunLayer.alphaProfile = value;
    });
    this.addNumberSetting(parent, strings.settings.sunLayer.gradientWidthLabel, sunLayer.gradientWidthPercent, (value) => {
            const normalized = Math.max(0, Math.min(100, value));
      sunLayer.gradientWidthPercent = normalized;
      return normalized;
    }, { min: 0, max: 100, step: "1", onChange: () => { this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.sunLayer.innerWidthLabel, sunLayer.gradientInnerRatio, (value) => {
            const normalized = Math.max(0, Math.min(1, value));
      sunLayer.gradientInnerRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.sunLayer.opacityScaleLabel, sunLayer.gradientOpacity, (value) => {
            const normalized = Math.max(0, Math.min(1, value));
      sunLayer.gradientOpacity = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshPreviewRow(); } });
    new Setting(parent)
    .setName(strings.settings.sunLayer.iconLabel)
      .addText((text) => {
                text.inputEl.maxLength = 4;
        text.inputEl.classList.add("weather-settings__icon-input");
        text.setValue(sunLayer.icon.symbol);
        text.onChange((value) => {
                    sunLayer.icon.symbol = value.trim() || DEFAULT_SETTINGS.sunLayer.icon.symbol;
          void this.plugin.saveSettings();
          this.refreshPreviewRow();
        });
      });
      this.addNumberSetting(parent, strings.settings.sunLayer.iconScaleLabel, sunLayer.icon.scale, (value) => {
            const normalized = Math.max(0.1, Math.min(5, value));
      sunLayer.icon.scale = normalized;
      return normalized;
    }, { min: 0.1, max: 5, step: "0.1", onChange: () => { this.refreshPreviewRow(); } });
    parent.createDiv({ cls: "weather-settings__hint", text: strings.settings.sunLayer.transitionsLabel });
    parent.createDiv({ cls: "weather-settings__hint", text: strings.settings.sunLayer.transitionsHint });
    const transitionDefaults = DEFAULT_SETTINGS.sunLayer.transitions;
    const ensureTransitionPhase = (phase: "sunrise" | "sunset") => {
      const transitions = this.plugin.settings.sunLayer.transitions ?? (
        this.plugin.settings.sunLayer.transitions = {
          sunrise: { ...transitionDefaults.sunrise },
          sunset: { ...transitionDefaults.sunset },
        }
      );
      if (!transitions[phase]) {
        transitions[phase] = { ...transitionDefaults[phase] };
      }
      return transitions[phase];
    };
    const getTransitionValue = (phase: "sunrise" | "sunset", field: "before" | "after") => {
      const transitions = this.plugin.settings.sunLayer.transitions;
      return transitions?.[phase]?.[field] ?? transitionDefaults[phase][field];
    };
    const createTransitionSetting = (
      phase: "sunrise" | "sunset",
      label: string,
      beforeLabel: string,
      afterLabel: string,
    ) => {
      const setting = new Setting(parent).setName(label);
      const row = setting.controlEl.createDiv({ cls: "weather-settings__sun-transition-row" });
      const createField = (fieldKey: "before" | "after", fieldLabel: string) => {
        const field = row.createDiv({ cls: "weather-settings__sun-transition-field" });
        field.createSpan({ cls: "weather-settings__sun-transition-field-label", text: fieldLabel });
        const input = field.createEl("input", {
          cls: "weather-settings__sun-transition-input",
          attr: { type: "number", min: "0", step: "1" },
        });
        input.value = String(getTransitionValue(phase, fieldKey));
        const commit = () => {
          const parsed = Number(input.value);
          if (!Number.isFinite(parsed) || parsed < 0) {
            input.value = String(getTransitionValue(phase, fieldKey));
            return;
          }
          const normalized = Math.round(parsed);
          const target = ensureTransitionPhase(phase);
          if (target[fieldKey] === normalized) {
            input.value = String(target[fieldKey]);
            return;
          }
          target[fieldKey] = normalized;
          input.value = String(normalized);
          void this.plugin.saveSettings();
          this.refreshPreviewRow();
        };
        input.addEventListener("change", commit);
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            input.blur();
          }
        });
      };
      createField("before", beforeLabel);
      createField("after", afterLabel);
    };
    createTransitionSetting(
      "sunrise",
      strings.settings.sunLayer.sunriseLabel,
      strings.settings.sunLayer.sunriseBeforeLabel,
      strings.settings.sunLayer.sunriseAfterLabel,
    );
    createTransitionSetting(
      "sunset",
      strings.settings.sunLayer.sunsetLabel,
      strings.settings.sunLayer.sunsetBeforeLabel,
      strings.settings.sunLayer.sunsetAfterLabel,
    );
  }
  private renderAlphaInputs(parent: HTMLElement, label: string, target: { peak: number; mid: number; low: number }): void {
        new Setting(parent)
    .setName(label)
      .addText((text) => {
                text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(target.peak));
        text.onChange((value) => {
                    const parsed = Number(value);
          if (Number.isFinite(parsed)) {
                        target.peak = Math.max(0, Math.min(1, parsed));
            text.setValue(String(target.peak));
            void this.plugin.saveSettings();
          }
        });
      })
      .addText((text) => {
                text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(target.mid));
        text.onChange((value) => {
                    const parsed = Number(value);
          if (Number.isFinite(parsed)) {
                        target.mid = Math.max(0, Math.min(1, parsed));
            text.setValue(String(target.mid));
            void this.plugin.saveSettings();
          }
        });
      })
      .addText((text) => {
                text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(target.low));
        text.onChange((value) => {
                    const parsed = Number(value);
          if (Number.isFinite(parsed)) {
                        target.low = Math.max(0, Math.min(1, parsed));
            text.setValue(String(target.low));
            void this.plugin.saveSettings();
          }
        });
      });
    }
  private renderCollapsibleSection(
        containerEl: HTMLElement,
    summary: string,
    description: string | null,
    renderer: (body: HTMLDivElement) => void,
  ): void {
        const detailsEl = containerEl.createEl("details", { cls: "weather-settings__section weather-settings__section--collapsible" });
    detailsEl.createEl("summary", { text: summary });
    const body = detailsEl.createDiv({ cls: "weather-settings__section-body" });
    if (description && description.trim().length > 0) {
            body.createEl("p", { text: description, cls: "weather-settings__hint" });
    }
    renderer(body);
  }
  private renderGradientPreviewSection(parent: HTMLElement, strings: LocaleStrings): void {
        const previewSection = parent.createDiv({ cls: "weather-settings__preview-section" });
    previewSection.createEl("h4", { text: strings.settings.preview.heading });
    previewSection.createEl("p", { text: strings.settings.preview.description, cls: "weather-settings__hint" });
    const widgetWrapper = previewSection.createDiv({ cls: "weather-settings__preview-widget" });
    const row = widgetWrapper.createDiv({ cls: "city-row weather-widget__row weather-settings__preview-row" });
    row.style.backgroundSize = "100% 100%, 100% 100%, 100% 100%";
    this.previewRow = row;
    this.previewOverlay = row.createDiv({ cls: "sun-overlay" });
    this.previewSunIconEl = row.createSpan({ cls: "sun-overlay__icon" });
    this.previewSunIconEl.setAttr("aria-hidden", "true");
    const leftGroup = row.createDiv({ cls: "city-row__group city-row__group--left" });
    const weatherCell = leftGroup.createDiv({ cls: "weather-info weather-widget__cell weather-widget__weather" });
    this.previewWeatherIconEl = weatherCell.createSpan({ cls: "weather-widget__icon" });
    this.previewWeatherTextEl = weatherCell.createSpan();
    const cityEl = leftGroup.createDiv({ cls: "city-name weather-widget__cell weather-widget__city" });
    cityEl.textContent = strings.settings.preview.sampleCity;
    const rightGroup = row.createDiv({ cls: "city-row__group city-row__group--right" });
    const timeCell = rightGroup.createDiv({ cls: "time-info weather-widget__cell weather-widget__time" });
    this.previewTimeIconEl = timeCell.createSpan({ cls: "weather-widget__icon" });
    this.previewTimeTextEl = timeCell.createSpan();
    this.previewDateEl = timeCell.createSpan({ cls: "weather-widget__date" });
    const temperatureContainer = rightGroup.createDiv({ cls: "temperature weather-widget__cell weather-widget__temperature" });
    this.previewTemperatureEl = temperatureContainer.createSpan();
    const controls = previewSection.createDiv({ cls: "weather-settings__preview-controls" });
    const timeSetting = new Setting(controls)
    .setName(strings.settings.preview.timeLabel)
      .setDesc(strings.settings.preview.timeHint);
      timeSetting.addSlider((slider) => {
            slider.setLimits(0, MINUTES_IN_DAY - 1, 1);
      slider.setValue(this.sampleTimeMinutes);
      slider.setDynamicTooltip();
      slider.onChange((value) => {
                this.sampleTimeMinutes = Math.round(value);
        this.refreshPreviewRow();
        this.refreshGradientPreview();
      });
    });
    const temperatureSetting = new Setting(controls)
    .setName(strings.settings.preview.temperatureLabel)
      .setDesc(strings.settings.preview.temperatureHint);
      let temperatureValue: HTMLSpanElement;
    const updateTemperatureLabel = () => {
            if (!temperatureValue) {
                return;
      }
      const formatted = `${this.sampleTemperature > 0 ? '+' : ''}${this.sampleTemperature}°`;
      temperatureValue.textContent = formatted;
    };
    temperatureSetting.addSlider((slider) => {
            slider.setLimits(TEMP_MIN, TEMP_MAX, 1);
      slider.setValue(this.sampleTemperature);
      slider.setDynamicTooltip();
      slider.onChange((value) => {
                this.sampleTemperature = Math.round(value);
        updateTemperatureLabel();
        this.refreshPreviewRow();
        this.refreshGradientPreview();
      });
    });
    temperatureValue = temperatureSetting.controlEl.createSpan({ cls: "weather-settings__preview-value" });
    temperatureSetting.controlEl.querySelector("input[type=\"range\"]")?.classList.add("weather-settings__preview-slider--temperature");
    updateTemperatureLabel();
    const weatherSetting = new Setting(controls)
    .setName(strings.settings.preview.weatherLabel)
      .setDesc(strings.settings.preview.weatherHint);
      weatherSetting.addDropdown((dropdown) => {
            WEATHER_CATEGORIES.forEach((category) => {
                dropdown.addOption(category, strings.weatherConditions[category]);
      });
      dropdown.setValue(this.sampleWeatherCategory);
      dropdown.onChange((value) => {
                this.sampleWeatherCategory = value as WeatherCategory;
        this.refreshPreviewRow();
        this.refreshGradientPreview();
      });
    });
    this.refreshPreviewRow();
  }
  private renderGradientAccordion(parent: HTMLElement, strings: LocaleStrings): void {
    this.renderGradientDetails(parent, strings.settings.gradients.time.title, (body) => {
            this.renderTimeGradientSection(body, strings);
    });
    this.renderGradientDetails(parent, strings.settings.gradients.weather.title, (body) => {
            this.renderWeatherGradientSection(body, strings);
    });
    this.renderGradientDetails(parent, strings.settings.gradients.temperature.title, (body) => {
            this.renderTemperatureGradientControls(body, strings);
    });
  }
  private renderGradientDetails(parent: HTMLElement, title: string, renderer: (body: HTMLElement) => void): void {
        const detailsEl = parent.createEl("details", { cls: "weather-settings__accordion" });
    detailsEl.createEl("summary", { text: title });
    const body = detailsEl.createDiv({ cls: "weather-settings__accordion-body" });
    renderer(body);
  }
  private renderGradientControlsContent(parent: HTMLElement, strings: LocaleStrings): void {
        this.gradientPreviewEl = this.createGradientPreview(parent);
    this.gradientPreviewEl.style.backgroundSize = "100% 100%, 100% 100%, 100% 100%";
    this.refreshGradientPreview();
    this.renderGradientAccordion(parent, strings);
  }
  private renderTimeGradientSection(parent: HTMLElement, strings: LocaleStrings): void {
    const updatePreview = () => {
      this.refreshGradientPreview();
    };
    this.updateTimeGradientPreview = updatePreview;
    updatePreview();
    this.addNumberSetting(parent, strings.settings.gradients.time.mixRatio, this.plugin.settings.gradients.timeBlend.mixRatio, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.timeBlend.mixRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.padding, this.plugin.settings.gradients.timeBlend.padding, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.timeBlend.padding = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.widthMin, this.plugin.settings.gradients.timeBlend.widthMin, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.timeBlend.widthMin = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.widthMax, this.plugin.settings.gradients.timeBlend.widthMax, (value) => {
      const normalized = Math.max(this.plugin.settings.gradients.timeBlend.widthMin, value);
      this.plugin.settings.gradients.timeBlend.widthMax = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.peakAlpha, this.plugin.settings.gradients.timeBlend.peakAlpha, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.timeBlend.peakAlpha = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.edgeAlpha, this.plugin.settings.gradients.timeBlend.edgeAlpha, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.timeBlend.edgeAlpha = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.steps, this.plugin.settings.gradients.timeBlend.steps, (value) => {
      const normalized = Math.max(0, Math.round(value));
      this.plugin.settings.gradients.timeBlend.steps = normalized;
      return normalized;
    }, { min: 0, step: "1", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.time.power, this.plugin.settings.gradients.timeBlend.power, (value) => {
      const normalized = Math.max(0.1, value);
      this.plugin.settings.gradients.timeBlend.power = normalized;
      return normalized;
    }, { min: 0.1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
  }
  private renderWeatherGradientSection(parent: HTMLElement, strings: LocaleStrings): void {
    const updatePreview = () => {
      this.refreshGradientPreview();
    };
    this.updateWeatherGradientPreview = updatePreview;
    updatePreview();
    this.addNumberSetting(parent, strings.settings.gradients.weather.padding, this.plugin.settings.gradients.weather.padding, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.weather.padding = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.widthMin, this.plugin.settings.gradients.weather.widthMin, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.weather.widthMin = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.widthMax, this.plugin.settings.gradients.weather.widthMax, (value) => {
      const normalized = Math.max(this.plugin.settings.gradients.weather.widthMin, value);
      this.plugin.settings.gradients.weather.widthMax = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.peakScale, this.plugin.settings.gradients.weather.peakScale, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.weather.peakScale = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.edgeScale, this.plugin.settings.gradients.weather.edgeScale, (value) => {
      const normalized = Math.max(0, value);
      this.plugin.settings.gradients.weather.edgeScale = normalized;
      return normalized;
    }, { min: 0, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.steps, this.plugin.settings.gradients.weather.steps, (value) => {
      const normalized = Math.max(0, Math.round(value));
      this.plugin.settings.gradients.weather.steps = normalized;
      return normalized;
    }, { min: 0, step: "1", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.weather.power, this.plugin.settings.gradients.weather.power, (value) => {
      const normalized = Math.max(0.1, value);
      this.plugin.settings.gradients.weather.power = normalized;
      return normalized;
    }, { min: 0.1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
  }
  private renderTemperatureGradientControls(parent: HTMLElement, strings: LocaleStrings): void {
    const updatePreview = () => {
      this.refreshGradientPreview();
    };
    this.updateTemperatureGradientPreview = updatePreview;
    updatePreview();
    this.addNumberSetting(parent, strings.settings.gradients.temperature.start, this.plugin.settings.gradients.temperature.start, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.temperature.start = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.temperature.end, this.plugin.settings.gradients.temperature.end, (value) => {
      const normalized = Math.max(this.plugin.settings.gradients.temperature.start, Math.min(1, value));
      this.plugin.settings.gradients.temperature.end = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.temperature.peakAlpha, this.plugin.settings.gradients.temperature.peakAlpha, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.temperature.peakAlpha = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.temperature.edgeAlpha, this.plugin.settings.gradients.temperature.edgeAlpha, (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      this.plugin.settings.gradients.temperature.edgeAlpha = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.temperature.steps, this.plugin.settings.gradients.temperature.steps, (value) => {
      const normalized = Math.max(0, Math.round(value));
      this.plugin.settings.gradients.temperature.steps = normalized;
      return normalized;
    }, { min: 0, step: "1", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
    this.addNumberSetting(parent, strings.settings.gradients.temperature.power, this.plugin.settings.gradients.temperature.power, (value) => {
      const normalized = Math.max(0.1, value);
      this.plugin.settings.gradients.temperature.power = normalized;
      return normalized;
    }, { min: 0.1, step: "0.01", onChange: () => { updatePreview(); this.refreshPreviewRow(); } });
  }
  private createGradientPreview(parent: HTMLElement): HTMLDivElement {
    return parent.createDiv({ cls: "weather-settings__gradient-preview" });
  }
  private refreshGradientPreview(): void {
    if (!this.gradientPreviewEl) {
      return;
    }
    const settings = this.plugin.settings;
    const daySpan = clamp(PREVIEW_DAY_SPAN, settings.daySpan.min, settings.daySpan.max);
    const dayStart = clamp(PREVIEW_DAY_START, 0, Math.max(0, 1 - daySpan));
    const dayEnd = clamp(dayStart + daySpan, 0, 1);
    const sunriseMinutes = dayStart * MINUTES_IN_DAY;
    const sunsetMinutes = dayEnd * MINUTES_IN_DAY;
    const categoryStyle = settings.categoryStyles[this.sampleWeatherCategory] ?? settings.categoryStyles.sunny;
    const weatherColor = ensureHex(categoryStyle.color, "#60a5fa");
    const temperatureColor = tempToColorSample(this.sampleTemperature, settings.temperatureGradient);
    const baseColor = ensureHex(settings.timeBaseColors.day, "#87CEEB");
    const gradientState = computeGradientLayers({
      settings,
      baseColor,
      weatherColor,
      temperatureColor,
      sunriseMinutes,
      sunsetMinutes,
    });
    this.gradientPreviewEl.style.backgroundColor = gradientState.backgroundColor;
    this.gradientPreviewEl.style.backgroundImage = `${gradientState.temperatureGradient}, ${gradientState.weatherGradient}`;
    this.gradientPreviewEl.style.backgroundSize = "100% 100%, 100% 100%";
    this.gradientPreviewEl.style.backgroundRepeat = "no-repeat, no-repeat";
    this.gradientPreviewEl.style.backgroundBlendMode = "normal, normal";
  }
  
  
  private refreshPreviewRow(): void {
    if (!this.previewRow) {
      return;
    }
    const settings = this.plugin.settings;
    const strings = this.plugin.getStrings();
    const daySpan = clamp(PREVIEW_DAY_SPAN, settings.daySpan.min, settings.daySpan.max);
    const dayStart = clamp(PREVIEW_DAY_START, 0, Math.max(0, 1 - daySpan));
    const dayEnd = clamp(dayStart + daySpan, 0, 1);
    const clampedTime = clamp(this.sampleTimeMinutes, 0, MINUTES_IN_DAY - 1);
    const localSeconds = clampedTime * 60;
    const previewBase = new Date();
    previewBase.setHours(0, 0, 0, 0);
    const previewDate = new Date(previewBase.getTime() + clampedTime * MS_PER_MINUTE);
    const previewLocalDate = shiftedDateByOffset(previewDate, PREVIEW_TIMEZONE_OFFSET);
    const sunAltitude = computeSolarAltitude(
      previewLocalDate,
      PREVIEW_LATITUDE,
      PREVIEW_LONGITUDE,
      PREVIEW_TIMEZONE_OFFSET,
    );
    const sunriseSeconds = dayStart * SECONDS_IN_DAY;
    const sunsetSeconds = dayEnd * SECONDS_IN_DAY;
    const hours = Math.floor(clampedTime / 60);
    const minutes = clampedTime % 60;
    const timeOfDay = this.getTimeOfDayFromMinutes(hours);
    const sunriseMinutesValue = dayStart * MINUTES_IN_DAY;
    const sunsetMinutesValue = dayEnd * MINUTES_IN_DAY;
    const sunPositionPercent = this.sunPositionPercent(sunriseSeconds, sunsetSeconds, localSeconds);
    const categoryStyle = this.plugin.settings.categoryStyles[this.sampleWeatherCategory] ?? this.plugin.settings.categoryStyles.sunny;
    const weatherColor = ensureHex(categoryStyle.color, "#6b7280");
    const temperatureColor = tempToColorSample(this.sampleTemperature, settings.temperatureGradient);
    const baseColor = this.computePreviewBackgroundColor(localSeconds, sunriseSeconds, sunsetSeconds);
    const gradientState = computeGradientLayers({
      settings,
      baseColor,
      weatherColor,
      temperatureColor,
      sunriseMinutes: sunriseMinutesValue,
      sunsetMinutes: sunsetMinutesValue,
    });
    this.previewRow.style.backgroundColor = gradientState.backgroundColor;
    this.previewRow.style.backgroundImage = `${gradientState.temperatureGradient}, ${gradientState.weatherGradient}`;
    this.previewRow.style.backgroundRepeat = "no-repeat, no-repeat";
    this.previewRow.style.backgroundBlendMode = "normal, normal";
    if (this.previewOverlay) {
      const overlayState = buildSunOverlayState({
        settings,
        nowMinutes: clampedTime,
        sunriseMinutes: sunriseMinutesValue,
        sunsetMinutes: sunsetMinutesValue,
        sunPositionPercent,
        timeOfDay,
        sunAltitudeDegrees: sunAltitude ?? undefined,
      });
      this.previewOverlay.style.background = overlayState.background;
      this.previewOverlay.style.backgroundBlendMode = overlayState.blendMode;
      this.previewOverlay.style.left = `-${overlayState.offsetPercent}%`;
      this.previewOverlay.style.right = "auto";
      this.previewOverlay.style.width = `${overlayState.widthPercent}%`;
      this.previewOverlay.style.top = "-16px";
      this.previewOverlay.style.bottom = "-16px";
      if (this.previewSunIconEl) {
        this.previewSunIconEl.textContent = overlayState.icon.symbol;
        this.previewSunIconEl.style.left = `${overlayState.icon.leftPercent}%`;
        this.previewSunIconEl.style.top = `${overlayState.icon.topPercent}%`;
        this.previewSunIconEl.style.transform = `translate(-50%, -50%) scale(${overlayState.icon.scale})`;
        this.previewSunIconEl.style.color = overlayState.icon.color;
        this.previewSunIconEl.style.opacity = `${overlayState.icon.opacity}`;
      }
    }
    const timeLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    if (this.previewTimeIconEl) {
      this.previewTimeIconEl.textContent = PREVIEW_TIME_EMOJIS[timeOfDay];
    }
    if (this.previewTimeTextEl) {
      this.previewTimeTextEl.textContent = timeLabel;
    }
    if (this.previewDateEl) {
      const showDate = this.plugin.settings.showDateWhenDifferent;
      this.previewDateEl.textContent = strings.settings.preview.sampleDate;
      this.previewDateEl.classList.toggle('is-hidden', !showDate);
      this.previewDateEl.style.opacity = showDate ? '0.6' : '0';
    }
    const weatherIcon = categoryStyle?.icon?.trim() || PREVIEW_FALLBACK_ICON;
    const weatherLabel = this.plugin.translateWeatherCategory(this.sampleWeatherCategory);
    if (this.previewWeatherIconEl) {
      this.previewWeatherIconEl.textContent = weatherIcon;
    }
    if (this.previewWeatherTextEl) {
      this.previewWeatherTextEl.textContent = weatherLabel;
    }
    if (this.previewTemperatureEl) {
      const temperatureLabel = `${this.sampleTemperature > 0 ? '+' : ''}${this.sampleTemperature}°`;
      this.previewTemperatureEl.textContent = temperatureLabel;
    }
  }
  private getTimeOfDayFromMinutes(hour: number): TimeOfDayKey {
    if (hour >= 6 && hour < 12) {
      return 'morning';
    }
    if (hour >= 12 && hour < 18) {
      return 'day';
    }
    if (hour >= 18 && hour < 22) {
      return 'evening';
    }
    return 'night';
  }
  private computePreviewBackgroundColor(localSeconds: number, sunriseSeconds: number, sunsetSeconds: number): string {
    const baseColors = this.plugin.settings.timeBaseColors;
    const dayColor = ensureHex(baseColors.day, '#87CEEB');
    const nightColor = ensureHex(baseColors.night, '#162331');
    const morningColor = ensureHex(baseColors.morning, '#FF8C42');
    const eveningColor = ensureHex(baseColors.evening, '#FF6B6B');
    if (sunriseSeconds === 0 && sunsetSeconds === 0) {
      return dayColor;
    }
    if (localSeconds < sunriseSeconds) {
      return lerpColorGamma(nightColor, morningColor, normalize(localSeconds, 0, sunriseSeconds));
    }
    if (localSeconds >= sunriseSeconds && localSeconds <= sunriseSeconds + 3_600) {
      return lerpColorGamma(morningColor, dayColor, normalize(localSeconds, sunriseSeconds, sunriseSeconds + 3_600));
    }
    if (localSeconds >= sunriseSeconds + 3_600 && localSeconds <= sunsetSeconds - 3_600) {
      return dayColor;
    }
    if (localSeconds >= sunsetSeconds - 3_600 && localSeconds <= sunsetSeconds) {
      return lerpColorGamma(dayColor, eveningColor, normalize(localSeconds, sunsetSeconds - 3_600, sunsetSeconds));
    }
    if (localSeconds > sunsetSeconds && localSeconds < SECONDS_IN_DAY) {
      return lerpColorGamma(eveningColor, nightColor, normalize(localSeconds, sunsetSeconds, SECONDS_IN_DAY));
    }
    return nightColor;
  }
  private sunPositionPercent(sunrise: number, sunset: number, localSeconds: number): number {
    if (sunrise >= sunset) {
      return 0;
    }
    if (localSeconds <= sunrise) {
      return 0;
    }
    if (localSeconds >= sunset) {
      return 100;
    }
    return ((localSeconds - sunrise) / (sunset - sunrise)) * 100;
  }
  private computeSunHighlight(timeOfDay: TimeOfDayKey): number {
    const sunLayer = this.plugin.settings.sunLayer;
    const highlight = timeOfDay === 'night'
      ? sunLayer.nightHighlight
      : timeOfDay === 'day'
        ? sunLayer.dayHighlight
        : sunLayer.twilightHighlight;
    return Math.max(this.plugin.settings.leftPanel.minHighlight, highlight);
  }
  private getTimeOfDayFromSeconds(localSeconds: number, sunriseSeconds: number, sunsetSeconds: number): TimeOfDayKey {
    const hour = Math.floor((localSeconds / 3600) % 24);
    return this.getTimeOfDayFromMinutes(hour);
  }
  
  hide(): void {
        super.hide();
    this.plugin.onSettingsTabClosed();
  }
  private renderOtherSection(parent: HTMLElement, strings: LocaleStrings): void {
        const section = parent.createDiv({ cls: "weather-settings__section" });
    section.createEl("h3", { text: strings.settings.other.heading });
    section.createEl("p", { text: strings.settings.other.description, cls: "weather-settings__hint" });
    this.addNumberSetting(
      section,
      strings.settings.gradients.edgeWidthLabel,
      this.plugin.settings.gradientEdgePortion,
      (value) => {
        const normalized = Math.min(0.5, Math.max(0, value));
        this.plugin.settings.gradientEdgePortion = normalized;
        return normalized;
      },
      {
        min: 0,
        max: 0.5,
        step: "0.01",
        desc: strings.settings.gradients.edgeWidthHint,
        onChange: () => {
          this.refreshGradientPreview();
          this.refreshPreviewRow();
        },
      },
    );
    new Setting(section)
    .setName(strings.settings.other.showDateLabel)
      .setDesc(strings.settings.other.showDateDescription)
      .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.showDateWhenDifferent);
        toggle.onChange((value) => {
                    this.plugin.settings.showDateWhenDifferent = value;
          void this.plugin.saveSettings();
          this.refreshPreviewRow();
        });
      });
    }
  private renderResetSection(containerEl: HTMLElement, strings: LocaleStrings): void {
        const section = containerEl.createDiv({ cls: "weather-settings__section" });
    section.createEl("h3", { text: strings.settings.reset.heading });
    section.createEl("p", { text: strings.settings.reset.description, cls: "weather-settings__hint" });
    new Setting(section)
    .addButton((button) => {
                button
        .setButtonText(strings.actions.reset)
          .setWarning()
          .onClick(async () => {
                        if (!confirm(strings.settings.reset.confirm)) {
                            return;
            }
            button.setDisabled(true);
            await this.plugin.resetSettings();
            this.display();
          });
        });
    }
  
  private normalizeAlphaProfile(value: string): AlphaEasingProfile {
        return ALPHA_PROFILE_OPTIONS.includes(value as AlphaEasingProfile)
    ? value as AlphaEasingProfile
      : DEFAULT_ALPHA_EASING_PROFILE;
    }
  private addAlphaProfileSetting(parent: HTMLElement, label: string, current: AlphaEasingProfile, strings: LocaleStrings, onChange: (value: AlphaEasingProfile) => void): void {
        new Setting(parent)
    .setName(label)
      .addDropdown((dropdown) => {
                ALPHA_PROFILE_OPTIONS.forEach((profile) => {
                    dropdown.addOption(profile, strings.settings.alphaProfiles[profile]);
        });
        dropdown.setValue(this.normalizeAlphaProfile(current));
        dropdown.onChange((value) => {
                    const normalized = this.normalizeAlphaProfile(value);
          onChange(normalized);
          void this.plugin.saveSettings();
          this.refreshGradientPreview();
          this.refreshPreviewRow();
        });
      });
    }
  private addNumberSetting(
        parent: HTMLElement,
    name: string,
    value: number,
    apply: (next: number) => number,
    options: { min?: number; max?: number; step?: string; desc?: string; onChange?: () => void } = {},
  ): void {
        const setting = new Setting(parent).setName(name);
    if (options.desc) {
            setting.setDesc(options.desc);
    }
    setting.addText((text) => {
            text.inputEl.type = "number";
      if (options.min != null) text.inputEl.min = String(options.min);
      if (options.max != null) text.inputEl.max = String(options.max);
      if (options.step != null) text.inputEl.step = options.step;
      text.setValue(String(value));
      text.onChange((raw) => {
                const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
                    const normalized = apply(parsed);
          text.setValue(String(normalized));
          void this.plugin.saveSettings();
          options.onChange?.();
        }
      });
    });
  }
}






