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

} from "./settings";

import { clamp, lerp, normalize } from "./utils/math";
import { ensureHex, lerpColorGamma, rgba } from "./utils/color";

import { createId } from "./utils/id";

const LAT_MIN = -90;

const LAT_MAX = 90;

const LON_MIN = -180;

const LON_MAX = 180;

const TEMP_MIN = -80;

const TEMP_MAX = 80;

const PREVIEW_DAY_START = 0.3;
const PREVIEW_DAY_SPAN = 0.4;
const PREVIEW_WEATHER_CATEGORY: WeatherCategory = "sunny";
const PREVIEW_TEMPERATURE = 20;

const MINUTES_IN_DAY = 1_440;
const SECONDS_IN_DAY = 86_400;
const PREVIEW_TIME_EMOJIS: Record<TimeOfDayKey, string> = {
  morning: "🌅",
  day: "🌞",
  evening: "🌇",
  night: "🌙",
};
const PREVIEW_FALLBACK_ICON = "☁";

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function buildSoftHillGradient(color: string, leftFrac: number, rightFrac: number, peakAlpha: number, edgeAlpha: number, steps: number, power: number): string {
  const start = clamp01(leftFrac);
  const end = clamp01(Math.max(start, rightFrac));
  const stops: string[] = [`${rgba(color, 0)} 0%`];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const position = start + (end - start) * t;
    const envelope = Math.pow(Math.sin(Math.PI * t), power);
    const alpha = clamp01(edgeAlpha + (peakAlpha - edgeAlpha) * envelope);
    const pct = Math.round(position * 1000) / 10;
    stops.push(`${rgba(color, alpha)} ${pct}%`);
  }
  stops.push(`${rgba(color, 0)} 100%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
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

  constructor(app: App, plugin: WeatherPlugin) {

    super(app, plugin);

    this.plugin = plugin;

  }

  display(): void {

    const { containerEl } = this;

    containerEl.empty();

    const strings = this.plugin.getStrings();

    this.renderLocalizationSection(containerEl, strings);

    this.renderRefreshSection(containerEl, strings);

    this.renderLocationsSection(containerEl, strings);

    this.renderGradientPreviewSection(containerEl, strings);

    const collapsibleRoot = containerEl.createDiv({ cls: "weather-settings__collapsible-group" });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.timePalette.heading, strings.settings.timePalette.description, (body) => {

      this.renderTimePaletteContent(body, strings);

    });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.weatherPalette.heading, strings.settings.weatherPalette.description, (body) => {

      this.renderWeatherPaletteContent(body, strings);

    });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.temperatureGradient.heading, strings.settings.temperatureGradient.description, (body) => {

      this.renderTemperatureGradientContent(body, strings);

    });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.sunLayer.heading, strings.settings.sunLayer.description, (body) => {

      this.renderSunLayerContent(body, strings);

    });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.gradients.heading, strings.settings.gradients.description, (body) => {

      this.renderGradientControlsContent(body, strings);

    });

    this.renderCollapsibleSection(collapsibleRoot, strings.settings.display.heading, strings.settings.display.description, (body) => {

      this.renderDisplayContent(body, strings);

    });

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

  private renderRefreshSection(containerEl: HTMLElement, strings: LocaleStrings): void {

    const section = containerEl.createDiv({ cls: "weather-settings__section" });

    section.createEl("h3", { text: strings.settings.refresh.heading });

    section.createEl("p", { text: strings.settings.refresh.description, cls: "weather-settings__hint" });

    new Setting(section)

      .setName(strings.settings.refresh.autoRefreshLabel)

      .setDesc(strings.settings.refresh.autoRefreshDescription)

      .addText((text) => {

        text.inputEl.type = "number";

        text.inputEl.min = "1";

        text.inputEl.step = "1";

        text.setValue(String(this.plugin.settings.autoRefreshMinutes));

        text.onChange((value) => {

          const parsed = Number(value);

          if (Number.isFinite(parsed) && parsed > 0) {

            const normalized = Math.max(1, Math.round(parsed));

            this.plugin.settings.autoRefreshMinutes = normalized;

            text.setValue(String(normalized));

            void this.plugin.saveSettings();

          }

        });

      });

    new Setting(section)

      .setName(strings.settings.refresh.cacheLabel)

      .setDesc(strings.settings.refresh.cacheDescription)

      .addText((text) => {

        text.inputEl.type = "number";

        text.inputEl.min = "5";

        text.inputEl.step = "5";

        text.setValue(String(this.plugin.settings.weatherCacheMinutes));

        text.onChange((value) => {

          const parsed = Number(value);

          if (Number.isFinite(parsed) && parsed > 0) {

            const normalized = Math.max(5, Math.round(parsed));

            this.plugin.settings.weatherCacheMinutes = normalized;

            text.setValue(String(normalized));

            void this.plugin.saveSettings();

          }

        });

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

    labelInput.addEventListener("input", () => {

      city.label = labelInput.value.trim();

      void this.plugin.saveSettings();

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

      setting

        .addColorPicker((picker) =>

          picker

            .setValue(this.plugin.settings.timeBaseColors[phase])

            .onChange((value) => {

              this.plugin.settings.timeBaseColors[phase] = value;

              void this.plugin.saveSettings();

              this.updateTimeGradientPreview?.();

            }))

        .addColorPicker((picker) =>

          picker

            .setValue(this.plugin.settings.timeTintColors[phase])

            .onChange((value) => {

              this.plugin.settings.timeTintColors[phase] = value;

              void this.plugin.saveSettings();

              this.updateTimeGradientPreview?.();

              this.refreshPreviewRow();

            }));

    });

  }

  private renderWeatherPaletteContent(parent: HTMLElement, strings: LocaleStrings): void {

    WEATHER_CATEGORIES.forEach((category) => {

      new Setting(parent)

        .setName(strings.weatherConditions[category])

        .addColorPicker((picker) =>

          picker

            .setValue(this.plugin.settings.categoryStyles[category].color)

            .onChange((value) => {

              this.plugin.settings.categoryStyles[category].color = value;

              void this.plugin.saveSettings();

              this.updateWeatherGradientPreview?.();

              this.updateTimeGradientPreview?.();

              this.refreshPreviewRow();

            }))

        .addText((text) => {

          text.setValue(this.plugin.settings.categoryStyles[category].icon);

          text.onChange((value) => {

            this.plugin.settings.categoryStyles[category].icon = value.trim() || DEFAULT_SETTINGS.categoryStyles[category].icon;

            void this.plugin.saveSettings();

          });

        });

    });

  }

  private renderTemperatureGradientContent(parent: HTMLElement, strings: LocaleStrings): void {

    const table = parent.createEl("table", { cls: "weather-settings__table" });

    const head = table.createTHead().insertRow();

    head.appendChild(document.createElement("th")).textContent = strings.settings.temperatureGradient.tableHeaders.temperature;

    head.appendChild(document.createElement("th")).textContent = strings.settings.temperatureGradient.tableHeaders.color;

    head.appendChild(document.createElement("th")).textContent = strings.settings.locations.tableHeaders.actions;

    const body = table.createTBody();

    this.plugin.settings.temperatureGradient.forEach((stop, index) => {

      const row = body.insertRow();

      this.renderTemperatureRow(row, stop, index, strings);

    });

    new Setting(parent)

      .addButton((button) => {

        button

          .setButtonText(strings.settings.temperatureGradient.addButtonLabel)

          .onClick(() => {

            const fallback = DEFAULT_SETTINGS.temperatureGradient[DEFAULT_SETTINGS.temperatureGradient.length - 1];

            this.plugin.settings.temperatureGradient.push({

              temperature: fallback.temperature,

              color: fallback.color,

            });

            this.persistTemperatureGradient(true);

            this.refreshPreviewRow();

          });

      });

  }

  private renderTemperatureRow(row: HTMLTableRowElement, stop: TemperatureColorStop, index: number, strings: LocaleStrings): void {

    const tempCell = row.insertCell();

    const tempInput = tempCell.createEl("input", {

      cls: "weather-settings__table-input",

      attr: { type: "number", step: "1" },

    });

    tempInput.value = String(stop.temperature);

    tempInput.addEventListener("input", () => {

      const parsed = Number(tempInput.value);

      if (Number.isFinite(parsed)) {

        stop.temperature = Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(parsed)));

        tempInput.value = String(stop.temperature);

        this.persistTemperatureGradient();

      }

    });

    const colorCell = row.insertCell();

    const colorInput = colorCell.createEl("input", {

      cls: "weather-settings__table-input weather-settings__table-input--color",

      attr: { type: "color" },

    });

    colorInput.value = stop.color;

    colorInput.addEventListener("input", () => {

      stop.color = colorInput.value;

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

      this.persistTemperatureGradient(true);

    });

  }

  private persistTemperatureGradient(refreshTable = false): void {

    void this.plugin.saveSettings();

    this.updateTemperatureGradientPreview?.();

    this.refreshPreviewRow();

    if (refreshTable) {

      this.display();

    }

  }

  private moveTemperatureStop(index: number, offset: number): void {

    const target = index + offset;

    if (target < 0 || target >= this.plugin.settings.temperatureGradient.length) {

      return;

    }

    const list = this.plugin.settings.temperatureGradient;

    [list[index], list[target]] = [list[target], list[index]];

    this.persistTemperatureGradient(true);

  }

  private renderSunLayerContent(parent: HTMLElement, strings: LocaleStrings): void {

    const colorGrid = parent.createDiv({ cls: "weather-settings__color-grid" });

    ([

      { key: "sunrise", label: strings.settings.sunLayer.sunriseColor },

      { key: "day", label: strings.settings.sunLayer.dayColor },

      { key: "night", label: strings.settings.sunLayer.nightColor },

    ] as const).forEach(({ key, label }) => {

      new Setting(colorGrid)

        .setName(label)

        .addColorPicker((picker) =>

          picker

            .setValue(this.plugin.settings.sunLayer.colors[key])

            .onChange((value) => {

              this.plugin.settings.sunLayer.colors[key] = value;

              void this.plugin.saveSettings();

            }));

    });

    this.addNumberSetting(parent, strings.settings.sunLayer.transitionLabel, this.plugin.settings.sunLayer.transitionMinutes, (value) => {

      const normalized = Math.max(1, Math.round(value));

      this.plugin.settings.sunLayer.transitionMinutes = normalized;

      return normalized;

    }, { min: 1, step: "1" });

    this.addNumberSetting(parent, strings.settings.sunLayer.widthLabel, this.plugin.settings.sunLayer.width, (value) => {

      const normalized = Math.max(1, Math.round(value));

      this.plugin.settings.sunLayer.width = normalized;

      return normalized;

    }, { min: 1, step: "1" });

    this.addNumberSetting(parent, strings.settings.sunLayer.softnessInnerLabel, this.plugin.settings.sunLayer.softnessInner, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.sunLayer.softnessInner = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.05" });

    this.addNumberSetting(parent, strings.settings.sunLayer.softnessOuterLabel, this.plugin.settings.sunLayer.softnessOuter, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.sunLayer.softnessOuter = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.05" });

    this.addNumberSetting(parent, strings.settings.sunLayer.twilightHighlightLabel, this.plugin.settings.sunLayer.twilightHighlight, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.sunLayer.twilightHighlight = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.sunLayer.dayHighlightLabel, this.plugin.settings.sunLayer.dayHighlight, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.sunLayer.dayHighlight = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.sunLayer.nightHighlightLabel, this.plugin.settings.sunLayer.nightHighlight, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.sunLayer.nightHighlight = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.renderAlphaInputs(parent, strings.settings.sunLayer.dayAlphaLabel, this.plugin.settings.sunLayer.alphaDay);

    this.renderAlphaInputs(parent, strings.settings.sunLayer.nightAlphaLabel, this.plugin.settings.sunLayer.alphaNight);

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

    const row = widgetWrapper.createDiv({ cls: "weather-widget__row weather-settings__preview-row" });

    row.style.backgroundSize = "100% 100%, 100% 100%, 100% 100%";

    this.previewRow = row;

    this.previewOverlay = row.createDiv({ cls: "sun-overlay" });

    const cityEl = row.createDiv({ cls: "weather-widget__cell weather-widget__city" });

    cityEl.textContent = strings.settings.preview.sampleCity;

    const timeCell = row.createDiv({ cls: "weather-widget__cell weather-widget__time" });

    this.previewTimeIconEl = timeCell.createSpan({ cls: "weather-widget__icon" });

    this.previewTimeTextEl = timeCell.createSpan();

    this.previewDateEl = timeCell.createSpan({ cls: "weather-widget__date" });

    const weatherCell = row.createDiv({ cls: "weather-widget__cell weather-widget__weather" });

    this.previewWeatherIconEl = weatherCell.createSpan({ cls: "weather-widget__icon" });

    this.previewWeatherTextEl = weatherCell.createSpan();

    this.previewTemperatureEl = row.createDiv({ cls: "weather-widget__cell weather-widget__temperature" }).createSpan();

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

    const timeGradient = this.buildTimeGradientPreview();
    const weatherGradient = this.buildWeatherGradientPreview();
    const temperatureGradient = this.buildTemperatureGradientPreview();

    this.gradientPreviewEl.style.backgroundColor = ensureHex(this.plugin.settings.timeBaseColors.day, "#87CEEB");
    this.gradientPreviewEl.style.backgroundImage = `${temperatureGradient}, ${weatherGradient}, ${timeGradient}`;
    this.gradientPreviewEl.style.backgroundSize = "100% 100%, 100% 100%, 100% 100%";
  }

  private buildTimeGradientPreview(): string {
    const settings = this.plugin.settings;
    const minSpan = settings.daySpan.min;
    const maxSpan = settings.daySpan.max;
    const spanRange = Math.max(0.0001, maxSpan - minSpan);
    const daySpan = clamp(PREVIEW_DAY_SPAN, minSpan, maxSpan);
    const spanNorm = clamp((daySpan - minSpan) / spanRange, 0, 1);
    const dayStart = clamp(PREVIEW_DAY_START, 0, Math.max(0, 1 - daySpan));
    const dayEnd = clamp(dayStart + daySpan, 0, 1);
    const width = settings.gradients.timeBlend.padding * lerp(settings.gradients.timeBlend.widthMin, settings.gradients.timeBlend.widthMax, spanNorm);
    const start = clamp(dayStart - daySpan * width, 0, 1);
    const end = clamp(dayEnd + daySpan * width, 0, 1);
    const baseColor = ensureHex(settings.timeBaseColors.day, "#87CEEB");
    const weatherColor = ensureHex(settings.categoryStyles[PREVIEW_WEATHER_CATEGORY].color, "#60a5fa");
    const transitionColor = lerpColorGamma(baseColor, weatherColor, settings.gradients.timeBlend.mixRatio);
    return buildSoftHillGradient(transitionColor, start, end, settings.gradients.timeBlend.peakAlpha, settings.gradients.timeBlend.edgeAlpha, settings.gradients.timeBlend.steps, settings.gradients.timeBlend.power);
  }

  private buildWeatherGradientPreview(): string {
    const settings = this.plugin.settings;
    const weather = settings.gradients.weather;
    const minSpan = settings.daySpan.min;
    const maxSpan = settings.daySpan.max;
    const spanRange = Math.max(0.0001, maxSpan - minSpan);
    const daySpan = clamp(PREVIEW_DAY_SPAN, minSpan, maxSpan);
    const spanNorm = clamp((daySpan - minSpan) / spanRange, 0, 1);
    const dayStart = clamp(PREVIEW_DAY_START, 0, Math.max(0, 1 - daySpan));
    const dayEnd = clamp(dayStart + daySpan, 0, 1);
    const width = weather.padding * lerp(weather.widthMin, weather.widthMax, spanNorm);
    const start = clamp(dayStart - daySpan * width, 0, 1);
    const end = clamp(dayEnd + daySpan * width, 0, 1);
    const color = ensureHex(settings.categoryStyles[PREVIEW_WEATHER_CATEGORY].color, "#60a5fa");
    const peakAlpha = 0.9 * weather.peakScale;
    const edgeAlpha = peakAlpha * 0.12 * weather.edgeScale;
    return buildSoftHillGradient(color, start, end, peakAlpha, edgeAlpha, weather.steps, weather.power);
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
    const sunriseSeconds = dayStart * SECONDS_IN_DAY;
    const sunsetSeconds = dayEnd * SECONDS_IN_DAY;

    const timeGradient = this.buildTimeGradientPreview();
    const weatherGradient = this.buildWeatherGradientPreview();
    const temperatureGradient = this.buildTemperatureGradientPreview();

    this.previewRow.style.backgroundImage = `${temperatureGradient}, ${weatherGradient}, ${timeGradient}`;
    this.previewRow.style.backgroundColor = this.computePreviewBackgroundColor(localSeconds, sunriseSeconds, sunsetSeconds);

    if (this.previewOverlay) {
      const overlay = this.buildSunOverlay(localSeconds, sunriseSeconds, sunsetSeconds);
      this.previewOverlay.style.background = overlay.background;
      this.previewOverlay.style.backgroundBlendMode = overlay.blendMode;
    }

    const hours = Math.floor(clampedTime / 60);
    const minutes = clampedTime % 60;
    const timeLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const timeOfDay = this.getTimeOfDayFromMinutes(hours);

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

    const categoryStyle = this.plugin.settings.categoryStyles[this.sampleWeatherCategory];
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

  private buildSunOverlay(localSeconds: number, sunriseSeconds: number, sunsetSeconds: number): { background: string; blendMode: string } {
    const settings = this.plugin.settings;
    const sunLayer = settings.sunLayer;
    const sunWidth = sunLayer.width;

    const sunPosition = this.sunPositionPercent(sunriseSeconds, sunsetSeconds, localSeconds);
    const isNight = localSeconds < sunriseSeconds || localSeconds > sunsetSeconds;

    let sunColor = ensureHex(sunLayer.colors.day, '#FFD200');
    let alphaPeak = sunLayer.alphaDay.peak;
    let alphaMid = sunLayer.alphaDay.mid;
    let alphaLow = sunLayer.alphaDay.low;

    const transitionMinutes = sunLayer.transitionMinutes * 60;
    const sunriseEnd = sunriseSeconds + transitionMinutes;
    const sunsetStart = sunsetSeconds - transitionMinutes;
    const sunsetEnd = sunsetSeconds + transitionMinutes;

    if (localSeconds >= Math.max(0, sunsetStart) && localSeconds < sunsetSeconds) {
      const t = normalize(localSeconds, sunsetStart, sunsetSeconds);
      sunColor = lerpColorGamma(sunLayer.colors.day, sunLayer.colors.sunrise, t);
      alphaPeak = sunLayer.alphaDay.peak;
      alphaMid = sunLayer.alphaDay.mid;
      alphaLow = sunLayer.alphaDay.low;
    } else if (localSeconds >= sunsetSeconds && localSeconds <= sunsetEnd) {
      const t = normalize(localSeconds, sunsetSeconds, sunsetEnd);
      sunColor = lerpColorGamma(sunLayer.colors.sunrise, sunLayer.colors.night, t);
      alphaPeak = lerp(sunLayer.alphaDay.peak, sunLayer.alphaNight.peak, t);
      alphaMid = lerp(sunLayer.alphaDay.mid, sunLayer.alphaNight.mid, t);
      alphaLow = lerp(sunLayer.alphaDay.low, sunLayer.alphaNight.low, t);
    } else if (localSeconds >= sunriseSeconds && localSeconds <= sunriseEnd) {
      const t = normalize(localSeconds, sunriseSeconds, sunriseEnd);
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

    const highlight = this.computeSunHighlight(this.getTimeOfDayFromSeconds(localSeconds, sunriseSeconds, sunsetSeconds));
    const tintColor = ensureHex(settings.categoryStyles[PREVIEW_WEATHER_CATEGORY].color, '#60a5fa');
    const leftMask = `linear-gradient(90deg,
      ${rgba(tintColor, highlight)} 0%,
      ${rgba(tintColor, highlight)} ${settings.leftPanel.width}%,
      transparent ${settings.leftPanel.width + 5}%,
      transparent 100%)`;

    return {
      background: `${sunGradient}, ${verticalFade}, ${leftMask}` ,
      blendMode: isNight ? 'multiply, multiply, screen' : 'screen, normal, screen',
    };
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

  private buildTemperatureGradientPreview(): string {
    const settings = this.plugin.settings;
    const temperature = settings.gradients.temperature;
    const color = tempToColorSample(PREVIEW_TEMPERATURE, settings.temperatureGradient);
    return buildSoftHillGradient(
      color,
      clamp(temperature.start, 0, 1),
      clamp(temperature.end, 0, 1),
      clamp(temperature.peakAlpha, 0, 1),
      clamp(temperature.edgeAlpha, 0, 1),
      temperature.steps,
      temperature.power,
    );
  }

  private renderDisplayContent(parent: HTMLElement, strings: LocaleStrings): void {

    this.addNumberSetting(parent, strings.settings.display.verticalFadeTop, this.plugin.settings.verticalFade.top, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.verticalFade.top = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.display.verticalFadeMiddle, this.plugin.settings.verticalFade.middle, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.verticalFade.middle = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.display.leftPanelWidth, this.plugin.settings.leftPanel.width, (value) => {

      const normalized = Math.max(0, value);

      this.plugin.settings.leftPanel.width = normalized;

      return normalized;

    }, { min: 0, step: "1" });

    this.addNumberSetting(parent, strings.settings.display.leftPanelHighlight, this.plugin.settings.leftPanel.minHighlight, (value) => {

      const normalized = Math.max(0, Math.min(1, value));

      this.plugin.settings.leftPanel.minHighlight = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.display.daySpanMin, this.plugin.settings.daySpan.min, (value) => {

      const normalized = Math.max(0, Math.min(this.plugin.settings.daySpan.max, value));

      this.plugin.settings.daySpan.min = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    this.addNumberSetting(parent, strings.settings.display.daySpanMax, this.plugin.settings.daySpan.max, (value) => {

      const normalized = Math.max(this.plugin.settings.daySpan.min, Math.min(1, value));

      this.plugin.settings.daySpan.max = normalized;

      return normalized;

    }, { min: 0, max: 1, step: "0.01" });

    new Setting(parent)

      .setName(strings.settings.display.showDateLabel)

      .setDesc(strings.settings.display.showDateDescription)

      .addToggle((toggle) => {

        toggle.setValue(this.plugin.settings.showDateWhenDifferent);

        toggle.onChange((value) => {

          this.plugin.settings.showDateWhenDifferent = value;

          void this.plugin.saveSettings();

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













