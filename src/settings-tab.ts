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
import { clamp, normalize } from "./utils/math";
import { ensureHex, lerpColorGamma } from "./utils/color";
import { DEFAULT_ALPHA_EASING_PROFILE, type AlphaEasingProfile } from "./utils/alpha-gradient";
import { computeSolarAltitude } from "./utils/solar";
import { buildSunOverlayState, computeGradientLayers } from "./utils/widget-render";
import { resolveTimePhaseColor } from "./ui/weather-widget";
import { createId } from "./utils/id";
import { extractDateComponents, formatDateComponents, normalizeDateFormat } from "./utils/date-format";
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
const PREVIEW_TIME_EMOJIS: Record<TimeOfDayKey, string> = { ...DEFAULT_SETTINGS.timeIcons };
const PREVIEW_FALLBACK_ICON = "☁";
const minutesToIsoLocal = (minutes: number): string => {
  const clamped = clamp(minutes, 0, MINUTES_IN_DAY - 1);
  const hours = Math.floor(clamped / 60);
  const mins = Math.round(clamped % 60);
  return `2024-01-01T${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};
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
  private appendSectionHeader(
    container: HTMLElement,
    title: string,
    description: string | null | undefined,
    options: { divider?: boolean } = {},
  ): void {
        const header = container.createDiv({ cls: "weather-settings__section-header" });
    header.createEl("h3", { text: title, cls: "weather-settings__section-header-title" });
    const desc = (description ?? "").trim();
    const descClasses = ["weather-settings__section-header-description"];
    if (desc.length === 0) {
      descClasses.push("is-empty");
    }
    header.createEl("p", {
      text: desc,
      cls: descClasses.join(" "),
    });
    if (options.divider) {
            container.createDiv({ cls: "weather-settings__section-divider" });
    }
  }
  private renderLocalizationSection(containerEl: HTMLElement, strings: LocaleStrings): void {
        const section = containerEl.createDiv({ cls: "weather-settings__section" });
    this.appendSectionHeader(section, strings.settings.localization.heading, strings.settings.localization.languageDescription);
    const localizationSetting = new Setting(section);
    localizationSetting.infoEl.remove();
    localizationSetting.addDropdown((dropdown) => {
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
    this.appendSectionHeader(section, strings.settings.widgetUpdates.heading, strings.settings.widgetUpdates.description);
    const rowSetting = new Setting(section);
    rowSetting.infoEl.remove();
    rowSetting.settingEl.addClass("weather-settings__widget-update");
    const control = rowSetting.controlEl;
    control.addClass("weather-settings__widget-update-control");
    const providerLinks = strings.settings.widgetUpdates.providerLinks ?? {};
    const providerNames = strings.settings.widgetUpdates.providerOptions ?? {};
    const providerColumn = control.createDiv({
      cls: "weather-settings__widget-update-column weather-settings__widget-update-column--provider",
    });
    const providerLabel = providerColumn.createEl("label", { cls: "weather-settings__field" });
    const providerHeader = providerLabel.createDiv({ cls: "weather-settings__field-header" });
    const providerLinkEl = providerHeader.createEl("a", {
      cls: "weather-settings__provider-link",
      text: strings.settings.widgetUpdates.providerLabel,
      attr: { href: "#", target: "_blank", rel: "noopener noreferrer" },
    });
    providerLinkEl.addEventListener("click", (event) => {
      if (providerLinkEl.hasClass("is-disabled")) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    const providerSelect = providerLabel.createEl("select", { cls: "weather-settings__provider-select" });
    providerSelect.setAttr("aria-label", strings.settings.widgetUpdates.providerLabel);
    Object.entries(strings.settings.widgetUpdates.providerOptions).forEach(([value, label]) => {
            providerSelect.createEl("option", { value, text: label });
    });
    providerSelect.value = this.plugin.settings.weatherProvider;
    const apiColumn = control.createDiv({
      cls: "weather-settings__widget-update-column weather-settings__widget-update-column--api",
    });
    const apiLabel = apiColumn.createEl("label", { cls: "weather-settings__field" });
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
      const providerName = providerNames[provider] ?? provider;
      providerLinkEl.setAttr("aria-label", `${strings.settings.widgetUpdates.providerLabel} - ${providerName}`);
      if (href && href.trim().length > 0) {
        providerLinkEl.setAttr("href", href);
        providerLinkEl.setAttr("title", providerName);
        providerLinkEl.setAttr("target", "_blank");
        providerLinkEl.setAttr("rel", "noopener noreferrer");
        providerLinkEl.removeClass("is-disabled");
        providerLinkEl.removeAttribute("tabindex");
      } else {
        providerLinkEl.setAttr("href", "#");
        providerLinkEl.removeAttribute("title");
        providerLinkEl.removeAttribute("target");
        providerLinkEl.removeAttribute("rel");
        providerLinkEl.addClass("is-disabled");
        providerLinkEl.setAttr("tabindex", "-1");
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
      apiColumn.classList.toggle("is-placeholder", !meta.requiresKey);

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
      this.plugin.requestWidgetRefresh();
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
    const intervalColumn = control.createDiv({
      cls: "weather-settings__widget-update-column weather-settings__widget-update-column--interval",
    });
    const intervalLabel = intervalColumn.createEl("label", { cls: "weather-settings__field" });
    intervalLabel.createSpan({ text: strings.settings.widgetUpdates.intervalLabel });
    const intervalInput = intervalLabel.createEl("input", {
      cls: "weather-settings__interval-input",
      attr: { type: "number", min: "1", step: "1" },
    });
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
    this.appendSectionHeader(section, strings.settings.locations.heading, strings.settings.locations.description, { divider: true });
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
    if (!this.plugin.settings.timeIcons) {
            this.plugin.settings.timeIcons = { ...DEFAULT_SETTINGS.timeIcons };
    }
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
      setting.addText((text) => {
                text.inputEl.maxLength = 5;
        text.inputEl.size = 5;
        text.inputEl.classList.add("weather-settings__icon-input");
        text.setValue(this.plugin.settings.timeIcons[phase] ?? DEFAULT_SETTINGS.timeIcons[phase]);
        text.onChange((value) => {
                    const trimmed = value.trim();
          this.plugin.settings.timeIcons[phase] = trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS.timeIcons[phase];
          void this.plugin.saveSettings();
          this.refreshPreviewRow();
        });
      });
        });
    this.appendSectionHeader(
      parent,
      strings.settings.timePalette.transitionsHeading,
      strings.settings.timePalette.transitionsHint,
      { divider: true },
    );
    const transitionDefaults = DEFAULT_SETTINGS.timeColorTransitions;
    const ensureTransitionPhase = (phase: "sunrise" | "sunset") => {
      const current = this.plugin.settings.timeColorTransitions ?? (
        this.plugin.settings.timeColorTransitions = {
          sunrise: { ...transitionDefaults.sunrise },
          sunset: { ...transitionDefaults.sunset },
        }
      );
      if (!current[phase]) {
        current[phase] = { ...transitionDefaults[phase] };
      }
      return current[phase];
    };
    const getTransitionValue = (phase: "sunrise" | "sunset", field: "before" | "after") => {
      const transitions = this.plugin.settings.timeColorTransitions;
      return transitions?.[phase]?.[field] ?? transitionDefaults[phase][field];
    };
    const transitionsRow = parent.createDiv({ cls: "weather-settings__grid weather-settings__sun-transition-columns" });
    const createTransitionColumn = (
      parentColumn: HTMLElement,
      phase: "sunrise" | "sunset",
      phaseLabel: string,
      beforeLabel: string,
      afterLabel: string,
    ) => {
      const column = parentColumn.createDiv({ cls: "weather-settings__sun-transition-column" });
      const inline = column.createDiv({ cls: "weather-settings__sun-transition-inline" });
      const beforeSpan = inline.createSpan({ cls: "weather-settings__sun-transition-label", text: beforeLabel });
      beforeSpan.setAttr("aria-hidden", "true");
      const beforeInput = inline.createEl("input", {
        cls: "weather-settings__sun-transition-input",
        attr: { type: "number", min: "0", step: "1" },
      });
      beforeInput.value = String(getTransitionValue(phase, "before"));
      inline.createSpan({ cls: "weather-settings__sun-transition-phase", text: phaseLabel });
      const afterInput = inline.createEl("input", {
        cls: "weather-settings__sun-transition-input",
        attr: { type: "number", min: "0", step: "1" },
      });
      afterInput.value = String(getTransitionValue(phase, "after"));
      const afterSpan = inline.createSpan({ cls: "weather-settings__sun-transition-label", text: afterLabel });
      afterSpan.setAttr("aria-hidden", "true");
      const bindInput = (fieldKey: "before" | "after", input: HTMLInputElement) => {
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
      bindInput("before", beforeInput);
      bindInput("after", afterInput);
    };
    createTransitionColumn(
      transitionsRow,
      "sunrise",
      strings.settings.timePalette.sunriseLabel,
      strings.settings.timePalette.sunriseBeforeLabel,
      strings.settings.timePalette.sunriseAfterLabel,
    );
    transitionsRow.createDiv({ cls: "weather-settings__divider-vertical" });
    createTransitionColumn(
      transitionsRow,
      "sunset",
      strings.settings.timePalette.sunsetLabel,
      strings.settings.timePalette.sunsetBeforeLabel,
      strings.settings.timePalette.sunsetAfterLabel,
    );
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
    const weatherControls = parent.createDiv({ cls: "weather-settings__grid weather-settings__triple-grid" });
    const weatherInnerSetting = this.addNumberSetting(weatherControls, strings.settings.weatherLayer.innerWidthLabel, weatherAlpha.innerOpacityRatio, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      weatherAlpha.innerOpacityRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    weatherInnerSetting.settingEl.addClass("weather-settings__grid-item");
    const weatherOpacitySetting = this.addNumberSetting(weatherControls, strings.settings.weatherLayer.opacityScaleLabel, weatherAlpha.opacityScale, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      weatherAlpha.opacityScale = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    weatherOpacitySetting.settingEl.addClass("weather-settings__grid-item");
    const weatherToggle = new Setting(weatherControls)
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
    weatherToggle.settingEl.addClass("weather-settings__grid-item");
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
    const temperatureControls = parent.createDiv({ cls: "weather-settings__grid weather-settings__triple-grid" });
    const temperatureInnerSetting = this.addNumberSetting(temperatureControls, strings.settings.temperatureLayer.innerWidthLabel, temperatureAlpha.innerOpacityRatio, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      temperatureAlpha.innerOpacityRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    temperatureInnerSetting.settingEl.addClass("weather-settings__grid-item");
    const temperatureOpacitySetting = this.addNumberSetting(temperatureControls, strings.settings.temperatureLayer.opacityScaleLabel, temperatureAlpha.opacityScale, (val) => {
            const normalized = Math.max(0, Math.min(1, val));
      temperatureAlpha.opacityScale = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshGradientPreview(); this.refreshPreviewRow(); } });
    temperatureOpacitySetting.settingEl.addClass("weather-settings__grid-item");
    const temperatureToggle = new Setting(temperatureControls)
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
    temperatureToggle.settingEl.addClass("weather-settings__grid-item");
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
    const colorGrid = parent.createDiv({ cls: "weather-settings__color-grid weather-settings__color-grid--sun" });
    (["night", "sunrise", "day", "sunset"] as const).forEach((key) => {
            new Setting(colorGrid)
      .setName(strings.settings.sunLayer.colors[key])
        .addColorPicker((picker) =>
          picker
          .setValue(sunLayer.colors[key])
            .onChange((value) => {
                        sunLayer.colors[key] = value;
              void this.plugin.saveSettings();
              this.refreshPreviewRow();
            }));
    });
    this.addAlphaProfileSetting(parent, strings.settings.sunLayer.alphaProfileLabel, sunLayer.alphaProfile, strings, (value) => {
            sunLayer.alphaProfile = value;
    });
    const sunControlGrid = parent.createDiv({ cls: "weather-settings__grid weather-settings__sun-control-grid" });
    const gradientWidthSetting = this.addNumberSetting(sunControlGrid, strings.settings.sunLayer.gradientWidthLabel, sunLayer.gradientWidthPercent, (value) => {
            const normalized = Math.max(0, Math.min(100, value));
      sunLayer.gradientWidthPercent = normalized;
      return normalized;
    }, { min: 0, max: 100, step: "1", onChange: () => { this.refreshPreviewRow(); } });
    gradientWidthSetting.settingEl.addClass("weather-settings__grid-item");
    const opaquePortionSetting = this.addNumberSetting(sunControlGrid, strings.settings.sunLayer.innerWidthLabel, sunLayer.gradientInnerRatio, (value) => {
            const normalized = Math.max(0, Math.min(1, value));
      sunLayer.gradientInnerRatio = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshPreviewRow(); } });
    opaquePortionSetting.settingEl.addClass("weather-settings__grid-item");
    const opacityMultiplierSetting = this.addNumberSetting(sunControlGrid, strings.settings.sunLayer.opacityScaleLabel, sunLayer.gradientOpacity, (value) => {
            const normalized = Math.max(0, Math.min(1, value));
      sunLayer.gradientOpacity = normalized;
      return normalized;
    }, { min: 0, max: 1, step: "0.01", onChange: () => { this.refreshPreviewRow(); } });
    opacityMultiplierSetting.settingEl.addClass("weather-settings__grid-item");
    const iconSetting = new Setting(sunControlGrid)
    .setName(strings.settings.sunLayer.iconLabel);
    iconSetting.settingEl.addClass("weather-settings__grid-item");
    let iconInputEl: HTMLInputElement | undefined;
    iconSetting.addText((text) => {
      text.inputEl.maxLength = 5;
      text.inputEl.classList.add("weather-settings__icon-input");
      text.inputEl.classList.toggle("is-monospaced", Boolean(sunLayer.icon.monospaced));
      iconInputEl = text.inputEl;
      text.setValue(sunLayer.icon.symbol);
      text.onChange((value) => {
                sunLayer.icon.symbol = value;
        void this.plugin.saveSettings();
        this.refreshPreviewRow();
      });
    });
    const iconMonospaceSetting = new Setting(sunControlGrid)
    .setName(strings.settings.sunLayer.iconMonospaceLabel);
    iconMonospaceSetting.settingEl.addClass("weather-settings__grid-item");
    iconMonospaceSetting.addToggle((toggle) => {
            toggle.setValue(Boolean(sunLayer.icon.monospaced));
      toggle.onChange((value) => {
                sunLayer.icon.monospaced = value;
        if (iconInputEl) {
          iconInputEl.classList.toggle("is-monospaced", value);
        }
        if (this.previewSunIconEl) {
          this.previewSunIconEl.classList.toggle("is-monospaced", value);
        }
        void this.plugin.saveSettings();
        this.refreshPreviewRow();
      });
    });
    const iconScaleSetting = this.addNumberSetting(sunControlGrid, strings.settings.sunLayer.iconScaleLabel, sunLayer.icon.scale, (value) => {
            const normalized = Math.max(0.1, Math.min(5, value));
      sunLayer.icon.scale = normalized;
      return normalized;
    }, { min: 0.1, max: 5, step: "0.1", onChange: () => { this.refreshPreviewRow(); } });
    iconScaleSetting.settingEl.addClass("weather-settings__grid-item");
    this.appendSectionHeader(parent, strings.settings.sunLayer.transitionsLabel, strings.settings.sunLayer.transitionsHint, { divider: true });
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
    const transitionsRow = parent.createDiv({ cls: "weather-settings__grid weather-settings__sun-transition-columns" });
    const createTransitionColumn = (
      parentColumn: HTMLElement,
      phase: "sunrise" | "sunset",
      phaseLabel: string,
      beforeLabel: string,
      afterLabel: string,
    ) => {
      const column = parentColumn.createDiv({ cls: "weather-settings__sun-transition-column" });
      const inline = column.createDiv({ cls: "weather-settings__sun-transition-inline" });
      const beforeSpan = inline.createSpan({ cls: "weather-settings__sun-transition-label", text: beforeLabel });
      beforeSpan.setAttr("aria-hidden", "true");
      const beforeInput = inline.createEl("input", {
        cls: "weather-settings__sun-transition-input",
        attr: { type: "number", min: "0", step: "1" },
      });
      beforeInput.value = String(getTransitionValue(phase, "before"));
      inline.createSpan({ cls: "weather-settings__sun-transition-phase", text: phaseLabel });
      const afterInput = inline.createEl("input", {
        cls: "weather-settings__sun-transition-input",
        attr: { type: "number", min: "0", step: "1" },
      });
      afterInput.value = String(getTransitionValue(phase, "after"));
      const afterSpan = inline.createSpan({ cls: "weather-settings__sun-transition-label", text: afterLabel });
      afterSpan.setAttr("aria-hidden", "true");
      const bindInput = (fieldKey: "before" | "after", input: HTMLInputElement) => {
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
      bindInput("before", beforeInput);
      bindInput("after", afterInput);
    };
    createTransitionColumn(
      transitionsRow,
      "sunrise",
      strings.settings.sunLayer.sunriseLabel,
      strings.settings.sunLayer.sunriseBeforeLabel,
      strings.settings.sunLayer.sunriseAfterLabel,
    );
    transitionsRow.createDiv({ cls: "weather-settings__divider-vertical" });
    createTransitionColumn(
      transitionsRow,
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
    const summaryEl = detailsEl.createEl("summary", { cls: "weather-settings__section-summary" });
    const summaryContent = summaryEl.createDiv({ cls: "weather-settings__section-summary-content" });
    summaryContent.createSpan({ cls: "weather-settings__section-summary-title", text: summary });
    if (description && description.trim().length > 0) {
            summaryContent.createSpan({ cls: "weather-settings__section-summary-description", text: description });
    }
    const body = detailsEl.createDiv({ cls: "weather-settings__section-body" });
    renderer(body);
  }
  private renderGradientPreviewSection(parent: HTMLElement, strings: LocaleStrings): void {
        const previewSection = parent.createDiv({ cls: "weather-settings__preview-section" });
    this.appendSectionHeader(previewSection, strings.settings.preview.heading, strings.settings.preview.description, { divider: true });
    const widgetWrapper = previewSection.createDiv({ cls: "weather-settings__preview-widget" });
    const row = widgetWrapper.createDiv({ cls: "ow-row weather-widget__row weather-settings__preview-row" });
    row.style.backgroundSize = "100% 100%, 100% 100%, 100% 100%";
    this.previewRow = row;
    this.previewOverlay = row.createDiv({ cls: "ow-sun-overlay" });
    this.previewSunIconEl = row.createSpan({ cls: "ow-sun-overlay__icon" });
    this.previewSunIconEl.setAttr("aria-hidden", "true");
    this.previewSunIconEl.classList.toggle("is-monospaced", Boolean(this.plugin.settings.sunLayer.icon.monospaced));
    const leftGroup = row.createDiv({ cls: "ow-row__group ow-row__group--left" });
    const weatherCell = leftGroup.createDiv({ cls: "ow-weather-info weather-widget__cell weather-widget__weather" });
    this.previewWeatherIconEl = weatherCell.createSpan({ cls: "weather-widget__icon" });
    this.previewWeatherTextEl = weatherCell.createSpan();
    const cityEl = leftGroup.createDiv({ cls: "ow-city-name weather-widget__cell weather-widget__city" });
    cityEl.textContent = strings.settings.preview.sampleCity;
    const rightGroup = row.createDiv({ cls: "ow-row__group ow-row__group--right" });
    const timeCell = rightGroup.createDiv({ cls: "ow-time-info weather-widget__cell weather-widget__time" });
    this.previewTimeIconEl = timeCell.createSpan({ cls: "weather-widget__icon" });
    this.previewTimeTextEl = timeCell.createSpan();
    this.previewDateEl = timeCell.createSpan({ cls: "weather-widget__date" });
    const temperatureContainer = rightGroup.createDiv({ cls: "ow-temperature weather-widget__cell weather-widget__temperature" });
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
      const temperatureValue = temperatureSetting.controlEl.createSpan({ cls: "weather-settings__preview-value" });
    const updateTemperatureLabel = () => {
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
    const sunriseIso = minutesToIsoLocal(sunriseMinutes);
    const sunsetIso = minutesToIsoLocal(sunsetMinutes);
    const categoryStyle = settings.categoryStyles[this.sampleWeatherCategory] ?? settings.categoryStyles.sunny;
    const weatherColor = ensureHex(categoryStyle.color, "#60a5fa");
    const temperatureColor = tempToColorSample(this.sampleTemperature, settings.temperatureGradient);
    const timePhase = resolveTimePhaseColor(
      settings,
      sunriseIso,
      sunsetIso,
      null,
      PREVIEW_TIMEZONE_OFFSET,
      PREVIEW_LONGITUDE,
      this.sampleTimeMinutes,
    );
    const derivedPhase = timePhase.phase ?? "day";
    const baseColor = ensureHex(timePhase.color, settings.timeBaseColors[derivedPhase]);
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
    const sunriseMinutesValue = dayStart * MINUTES_IN_DAY;
    const sunsetMinutesValue = dayEnd * MINUTES_IN_DAY;
    const sunriseIso = minutesToIsoLocal(sunriseMinutesValue);
    const sunsetIso = minutesToIsoLocal(sunsetMinutesValue);
    const timePhase = resolveTimePhaseColor(
      settings,
      sunriseIso,
      sunsetIso,
      null,
      PREVIEW_TIMEZONE_OFFSET,
      PREVIEW_LONGITUDE,
      clampedTime,
    );
    const derivedPhase = timePhase.phase ?? "day";
    const baseColor = ensureHex(timePhase.color, settings.timeBaseColors[derivedPhase]);
    const sunPositionPercent = this.sunPositionPercent(sunriseSeconds, sunsetSeconds, localSeconds);
    const categoryStyle = this.plugin.settings.categoryStyles[this.sampleWeatherCategory] ?? this.plugin.settings.categoryStyles.sunny;
    const weatherColor = ensureHex(categoryStyle.color, "#6b7280");
    const temperatureColor = tempToColorSample(this.sampleTemperature, settings.temperatureGradient);
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
      const measuredPreviewWidth = this.previewRow.clientWidth || this.previewRow.offsetWidth;
      const rowWidthPx = Number.isFinite(measuredPreviewWidth) && (measuredPreviewWidth ?? 0) > 0
        ? measuredPreviewWidth
        : (this.previewRow.parentElement?.clientWidth || 600);
      const overlayState = buildSunOverlayState({
        settings,
        nowMinutes: clampedTime,
        sunriseMinutes: sunriseMinutesValue,
        sunsetMinutes: sunsetMinutesValue,
        sunPositionPercent,
        timeOfDay: derivedPhase,
        sunAltitudeDegrees: sunAltitude ?? undefined,
        rowWidthPx,
      });
      this.previewOverlay.style.background = overlayState.background;
      this.previewOverlay.style.backgroundBlendMode = overlayState.blendMode;
      this.previewOverlay.style.backgroundRepeat = "no-repeat, no-repeat";
      this.previewOverlay.style.backgroundSize = "100% 100%, 100% 100%";
      this.previewOverlay.style.left = `${overlayState.leftPercent}%`;
      this.previewOverlay.style.right = "auto";
      this.previewOverlay.style.width = `${overlayState.widthPercent}%`;
      this.previewOverlay.style.top = "0";
      this.previewOverlay.style.bottom = "0";
      if (this.previewSunIconEl) {
        this.previewSunIconEl.classList.toggle("is-monospaced", Boolean(this.plugin.settings.sunLayer.icon.monospaced));
        this.previewSunIconEl.textContent = overlayState.icon.symbol;
        this.previewSunIconEl.style.left = `${overlayState.icon.leftPercent}%`;
        this.previewSunIconEl.style.top = `${overlayState.icon.topPercent}%`;
        this.previewSunIconEl.style.transform = `translate(-50%, -50%) scale(${overlayState.icon.scale})`;
        this.previewSunIconEl.dataset.verticalProgress = overlayState.icon.verticalProgress.toFixed(3);
        this.previewSunIconEl.style.color = overlayState.icon.color;
        this.previewSunIconEl.style.opacity = `${overlayState.icon.opacity}`;
      }
    }
    const timeLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    if (this.previewTimeIconEl) {
      const icons = this.plugin.settings.timeIcons ?? PREVIEW_TIME_EMOJIS;
      const primary = icons[derivedPhase]?.trim();
      const fallback = PREVIEW_TIME_EMOJIS[derivedPhase]?.trim();
      const icon = primary && primary.length > 0 ? primary : fallback ?? "";
      this.previewTimeIconEl.textContent = icon;
    }
    if (this.previewTimeTextEl) {
      this.previewTimeTextEl.textContent = timeLabel;
    }
    if (this.previewDateEl) {
      const dateFormat = normalizeDateFormat(this.plugin.settings.dateFormat, DEFAULT_SETTINGS.dateFormat);
      const cityDateComponents = extractDateComponents(previewLocalDate);
      const dateLabel = formatDateComponents(
        cityDateComponents,
        dateFormat,
        DEFAULT_SETTINGS.dateFormat,
        strings.date.monthNames,
      );
      const shouldShowDate = this.plugin.settings.showDateWhenDifferent;
      this.previewDateEl.textContent = shouldShowDate ? dateLabel : "";
      this.previewDateEl.classList.toggle("is-hidden", !shouldShowDate);
      this.previewDateEl.style.opacity = shouldShowDate ? "0.6" : "0";
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
  
  hide(): void {
        super.hide();
    this.plugin.onSettingsTabClosed();
  }
  private renderOtherSection(parent: HTMLElement, strings: LocaleStrings): void {
        const section = parent.createDiv({ cls: "weather-settings__section" });
    this.appendSectionHeader(section, strings.settings.other.heading, strings.settings.other.description);
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
    const dateRow = section.createDiv({ cls: "weather-settings__date-row" });
    new Setting(dateRow)
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
    new Setting(dateRow)
    .setName(strings.settings.other.dateFormatLabel)
      .setDesc(strings.settings.other.dateFormatDescription)
      .addText((text) => {
                text.setPlaceholder(DEFAULT_SETTINGS.dateFormat);
        text.setValue(this.plugin.settings.dateFormat);
        text.onChange((value) => {
                    const trimmed = value.trim();
          const normalized = trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS.dateFormat;
          if (this.plugin.settings.dateFormat === normalized) {
            return;
          }
          this.plugin.settings.dateFormat = normalized;
          text.setValue(normalized);
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
  private addAlphaProfileSetting(
        parent: HTMLElement,
    label: string,
    current: AlphaEasingProfile,
    strings: LocaleStrings,
    onChange: (value: AlphaEasingProfile) => void,
  ): Setting {
        const setting = new Setting(parent);
    setting.setName(label);
    setting.addDropdown((dropdown) => {
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
    return setting;
  }
  private addNumberSetting(
        parent: HTMLElement,
    name: string,
    value: number,
    apply: (next: number) => number,
    options: { min?: number; max?: number; step?: string; desc?: string; onChange?: () => void } = {},
  ): Setting {
        const setting = new Setting(parent).setName(name);
    if (options.desc) {
            setting.setDesc(options.desc);
    }
    setting.addText((text) => {
            const getStepPrecision = (step?: string): number => {
        if (!step || step === "any") {
          return 0;
        }
        const [, decimals = ""] = step.split(".");
        return decimals.length;
      };
      const decimalPlaces = getStepPrecision(options.step);
      const precisionFactor = decimalPlaces > 0 ? 10 ** decimalPlaces : null;
      const quantize = (input: number): number => {
        if (precisionFactor === null) {
          return input;
        }
        return Math.round(input * precisionFactor) / precisionFactor;
      };
      const formatValue = (input: number): string => {
        if (precisionFactor === null) {
          return String(input);
        }
        return quantize(input).toFixed(decimalPlaces);
      };
      const epsilon = precisionFactor !== null ? 1 / (precisionFactor * 2) : 0;
      let currentValue = quantize(value);
      text.inputEl.type = "number";
      if (options.min != null) text.inputEl.min = String(options.min);
      if (options.max != null) text.inputEl.max = String(options.max);
      if (options.step != null) text.inputEl.step = options.step;
      if (precisionFactor !== null) {
        text.inputEl.inputMode = "decimal";
      }
      text.setValue(formatValue(currentValue));
      const commitValue = (raw: string, finalize: boolean): void => {
        const normalizedRaw = raw.replace(",", ".").trim();
        if (normalizedRaw.length === 0) {
          if (finalize) {
            text.setValue(formatValue(currentValue));
          }
          return;
        }
        const parsed = Number(normalizedRaw);
        if (!Number.isFinite(parsed)) {
          if (finalize) {
            text.setValue(formatValue(currentValue));
          }
          return;
        }
        const rounded = quantize(parsed);
        const applied = quantize(apply(rounded));
        const changed = Math.abs(applied - currentValue) > epsilon;
        if (changed) {
          currentValue = applied;
          void this.plugin.saveSettings();
          options.onChange?.();
        }
        if (finalize || rounded !== applied || changed) {
          text.setValue(formatValue(applied));
        }
      };
      text.onChange((raw) => {
                commitValue(raw, false);
      });
      text.inputEl.addEventListener("blur", () => {
                commitValue(text.inputEl.value, true);
      });
    });
    return setting;
  }
}
