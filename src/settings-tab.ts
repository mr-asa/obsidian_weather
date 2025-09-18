import { App, PluginSettingTab, Setting } from "obsidian";
import type WeatherPlugin from "./main";
import type { LocaleCode } from "./i18n/types";
import type { LocaleStrings } from "./i18n/strings";
import { DEFAULT_SETTINGS } from "./settings";
import type { CityLocation, SunCycleKey, TemperatureColorStop, WeatherConditionKey } from "./settings";
import { createId } from "./utils/id";

const SUN_PHASE_ORDER: SunCycleKey[] = ["morning", "day", "evening", "night"];
const WEATHER_CONDITION_ORDER: WeatherConditionKey[] = [
  "clear",
  "partlyCloudy",
  "cloudy",
  "rain",
  "thunderstorm",
  "snow",
  "fog",
];
const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;
const TEMP_MIN = -60;
const TEMP_MAX = 60;

type TableButtonOptions = {
  text: string;
  ariaLabel?: string;
  disabled?: boolean;
  variant?: "icon" | "text";
  onClick: () => Promise<void> | void;
};

export class WeatherSettingsTab extends PluginSettingTab {
  private readonly plugin: WeatherPlugin;

  constructor(app: App, plugin: WeatherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("weather-settings");

    const strings = this.plugin.getStrings();

    this.renderLocalizationSection(containerEl, strings);
    this.renderApiSection(containerEl, strings);
    this.renderLocationsSection(containerEl, strings);
    this.renderSunColorsSection(containerEl, strings);
    this.renderSunBackgroundsSection(containerEl, strings);
    this.renderWeatherPaletteSection(containerEl, strings);
    this.renderTemperatureGradientSection(containerEl, strings);
  }

  private renderLocalizationSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.localization.heading });

    new Setting(sectionEl)
      .setName(strings.settings.localization.languageLabel)
      .setDesc(strings.settings.localization.languageDescription)
      .addDropdown((dropdown) => {
        const languageNames = strings.languageNames;
        (Object.keys(languageNames) as LocaleCode[]).forEach((locale) => {
          dropdown.addOption(locale, languageNames[locale]);
        });

        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange(async (value) => {
          this.plugin.settings.language = value as LocaleCode;
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }

  private renderApiSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.api.heading });

    new Setting(sectionEl)
      .setName(strings.settings.api.apiKeyLabel)
      .setDesc(strings.settings.api.apiKeyDescription)
      .addText((text) =>
        text
          .setPlaceholder(strings.settings.api.apiKeyPlaceholder)
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderLocationsSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.locations.heading });
    sectionEl.createEl("p", { text: strings.settings.locations.description, cls: "weather-settings__hint" });

    const table = sectionEl.createEl("table", { cls: "weather-settings__table" });
    const headRow = table.createEl("thead").createEl("tr");
    headRow.createEl("th", { text: "" });
    headRow.createEl("th", { text: strings.settings.locations.tableHeaders.name });
    headRow.createEl("th", { text: strings.settings.locations.tableHeaders.latitude });
    headRow.createEl("th", { text: strings.settings.locations.tableHeaders.longitude });

    const body = table.createEl("tbody");

    if (this.plugin.settings.cities.length === 0) {
      const emptyRow = body.createEl("tr");
      const cell = emptyRow.createEl("td", { text: strings.settings.locations.emptyState, cls: "weather-settings__empty" });
      cell.colSpan = 4;
    } else {
      this.plugin.settings.cities.forEach((city, index) => {
        this.renderCityRow(body, city, index, strings);
      });
    }

    new Setting(sectionEl)
      .addButton((button) =>
        button
          .setButtonText(strings.settings.locations.addButtonLabel)
          .setCta()
          .onClick(async () => {
            const newCity: CityLocation = {
              id: createId("city"),
              name: "",
              latitude: 0,
              longitude: 0,
            };
            this.plugin.settings.cities.push(newCity);
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  private renderCityRow(body: HTMLElement, city: CityLocation, index: number, strings: LocaleStrings): void {
    const total = this.plugin.settings.cities.length;
    const row = body.createEl("tr");

    const actionsCell = row.createEl("td");
    const actionsWrapper = actionsCell.createDiv({ cls: "weather-settings__table-actions" });

    this.createTableButton(actionsWrapper, {
      text: "↑",
      ariaLabel: strings.actions.moveUp,
      disabled: index === 0,
      variant: "icon",
      onClick: async () => {
        await this.moveCity(index, -1);
      },
    });

    this.createTableButton(actionsWrapper, {
      text: "↓",
      ariaLabel: strings.actions.moveDown,
      disabled: index === total - 1,
      variant: "icon",
      onClick: async () => {
        await this.moveCity(index, 1);
      },
    });

    this.createTableButton(actionsWrapper, {
      text: strings.actions.remove,
      onClick: async () => {
        this.plugin.settings.cities = this.plugin.settings.cities.filter((item) => item.id !== city.id);
        await this.plugin.saveSettings();
        this.display();
      },
    });

    this.renderCityNameCell(row.createEl("td"), city, strings);
    this.renderCityCoordinateCell(row.createEl("td"), city, "latitude");
    this.renderCityCoordinateCell(row.createEl("td"), city, "longitude");
  }

  private renderCityNameCell(cell: HTMLTableCellElement, city: CityLocation, strings: LocaleStrings): void {
    const input = cell.createEl("input", {
      cls: "weather-settings__table-input",
      attr: {
        type: "text",
        placeholder: strings.settings.locations.tableHeaders.name,
      },
    });
    input.value = city.name ?? "";

    input.addEventListener("change", async () => {
      city.name = input.value.trim();
      await this.plugin.saveSettings();
    });
  }

  private renderCityCoordinateCell(
    cell: HTMLTableCellElement,
    city: CityLocation,
    key: "latitude" | "longitude",
  ): void {
    const limits = key === "latitude" ? { min: LAT_MIN, max: LAT_MAX } : { min: LON_MIN, max: LON_MAX };
    const input = cell.createEl("input", {
      cls: "weather-settings__table-input",
      attr: {
        type: "number",
        step: "0.0001",
      },
    });
    input.value = String(city[key] ?? 0);

    input.addEventListener("change", async () => {
      const parsed = Number(input.value);
      if (Number.isNaN(parsed)) {
        input.value = String(city[key]);
        return;
      }

      const clamped = Math.min(limits.max, Math.max(limits.min, parsed));
      city[key] = clamped;
      input.value = String(clamped);
      await this.plugin.saveSettings();
    });
  }

  private renderSunColorsSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.sunColors.heading });
    sectionEl.createEl("p", { text: strings.settings.sunColors.description, cls: "weather-settings__hint" });

    const rowEl = sectionEl.createDiv({ cls: "weather-settings__sun-row" });
    const colorsWrapper = rowEl.createDiv({ cls: "weather-settings__color-grid" });

    SUN_PHASE_ORDER.forEach((phase) => {
      new Setting(colorsWrapper)
        .setName(strings.sunPhases[phase])
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.sunCycleColors[phase])
            .onChange(async (value) => {
              this.plugin.settings.sunCycleColors[phase] = value;
              await this.plugin.saveSettings();
            }),
        );
    });

    const widthSetting = new Setting(rowEl)
      .setName(strings.settings.sunColors.widthLabel)
      .addText((text) => {
        text.setValue(String(this.plugin.settings.sunGradientWidthPercent));
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "100";
        text.inputEl.step = "1";
        text.onChange(async (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            text.setValue(String(this.plugin.settings.sunGradientWidthPercent));
            return;
          }

          const clamped = Math.min(100, Math.max(1, Math.round(numeric)));
          this.plugin.settings.sunGradientWidthPercent = clamped;
          text.setValue(String(clamped));
          await this.plugin.saveSettings();
        });
      })
      .addExtraButton((button) =>
        button
          .setIcon("rotate-ccw")
          .setTooltip(strings.actions.reset)
          .onClick(async () => {
            this.plugin.settings.sunGradientWidthPercent = DEFAULT_SETTINGS.sunGradientWidthPercent;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    widthSetting.settingEl.addClass("weather-settings__sun-width");
  }

  private renderSunBackgroundsSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.sunBackgrounds.heading });
    sectionEl.createEl("p", { text: strings.settings.sunBackgrounds.description, cls: "weather-settings__hint" });

    const wrapper = sectionEl.createDiv({ cls: "weather-settings__color-grid" });

    SUN_PHASE_ORDER.forEach((phase) => {
      new Setting(wrapper)
        .setName(strings.sunPhases[phase])
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.sunCycleBackgrounds[phase])
            .onChange(async (value) => {
              this.plugin.settings.sunCycleBackgrounds[phase] = value;
              await this.plugin.saveSettings();
            }),
        );
    });
  }

  private renderWeatherPaletteSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.weatherPalette.heading });
    sectionEl.createEl("p", { text: strings.settings.weatherPalette.description, cls: "weather-settings__hint" });

    const wrapper = sectionEl.createDiv({ cls: "weather-settings__color-grid" });

    WEATHER_CONDITION_ORDER.forEach((condition) => {
      new Setting(wrapper)
        .setName(strings.weatherConditions[condition])
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.weatherConditionPalette[condition])
            .onChange(async (value) => {
              this.plugin.settings.weatherConditionPalette[condition] = value;
              await this.plugin.saveSettings();
            }),
        );
    });
  }

  private renderTemperatureGradientSection(parent: HTMLElement, strings: LocaleStrings): void {
    const sectionEl = parent.createDiv({ cls: "weather-settings__section" });
    sectionEl.createEl("h3", { text: strings.settings.temperatureGradient.heading });
    sectionEl.createEl("p", { text: strings.settings.temperatureGradient.description, cls: "weather-settings__hint" });

    const table = sectionEl.createEl("table", { cls: "weather-settings__table" });
    const headRow = table.createEl("thead").createEl("tr");
    headRow.createEl("th", { text: "" });
    headRow.createEl("th", { text: strings.settings.temperatureGradient.tableHeaders.temperature });
    headRow.createEl("th", { text: strings.settings.temperatureGradient.tableHeaders.color });

    const body = table.createEl("tbody");
    if (this.plugin.settings.temperatureGradient.length === 0) {
      const emptyRow = body.createEl("tr");
      const cell = emptyRow.createEl("td", { text: strings.settings.locations.emptyState, cls: "weather-settings__empty" });
      cell.colSpan = 3;
    } else {
      this.plugin.settings.temperatureGradient.forEach((stop, index) => {
        this.renderGradientRow(body, stop, index, strings);
      });
    }

    new Setting(sectionEl)
      .addButton((button) =>
        button
          .setButtonText(strings.settings.temperatureGradient.addButtonLabel)
          .setCta()
          .onClick(async () => {
            const newStop: TemperatureColorStop = {
              temperature: 0,
              color: "#ffffff",
            };
            this.plugin.settings.temperatureGradient.push(newStop);
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  private renderGradientRow(
    body: HTMLElement,
    stop: TemperatureColorStop,
    index: number,
    strings: LocaleStrings,
  ): void {
    const total = this.plugin.settings.temperatureGradient.length;
    const row = body.createEl("tr");

    const actionsCell = row.createEl("td");
    const actionsWrapper = actionsCell.createDiv({ cls: "weather-settings__table-actions" });

    this.createTableButton(actionsWrapper, {
      text: "↑",
      ariaLabel: strings.actions.moveUp,
      disabled: index === 0,
      variant: "icon",
      onClick: async () => {
        await this.moveTemperatureStop(index, -1);
      },
    });

    this.createTableButton(actionsWrapper, {
      text: "↓",
      ariaLabel: strings.actions.moveDown,
      disabled: index === total - 1,
      variant: "icon",
      onClick: async () => {
        await this.moveTemperatureStop(index, 1);
      },
    });

    this.createTableButton(actionsWrapper, {
      text: strings.actions.remove,
      onClick: async () => {
        this.plugin.settings.temperatureGradient.splice(index, 1);
        await this.plugin.saveSettings();
        this.display();
      },
    });

    const temperatureCell = row.createEl("td");
    const tempInput = temperatureCell.createEl("input", {
      cls: "weather-settings__table-input",
      attr: {
        type: "number",
        step: "1",
      },
    });
    tempInput.value = String(stop.temperature);
    tempInput.addEventListener("change", async () => {
      const parsed = Number(tempInput.value);
      if (Number.isNaN(parsed)) {
        tempInput.value = String(stop.temperature);
        return;
      }

      const clamped = Math.min(TEMP_MAX, Math.max(TEMP_MIN, parsed));
      stop.temperature = clamped;
      tempInput.value = String(clamped);
      await this.plugin.saveSettings();
    });

    const colorCell = row.createEl("td");
    const colorInput = colorCell.createEl("input", {
      cls: "weather-settings__table-input weather-settings__table-input--color",
      attr: {
        type: "color",
      },
    });
    colorInput.value = stop.color;
    colorInput.addEventListener("input", async () => {
      stop.color = colorInput.value;
      await this.plugin.saveSettings();
    });
  }

  private async moveCity(index: number, offset: number): Promise<void> {
    const target = index + offset;
    if (target < 0 || target >= this.plugin.settings.cities.length) {
      return;
    }

    this.moveArrayItem(this.plugin.settings.cities, index, target);
    await this.plugin.saveSettings();
    this.display();
  }

  private async moveTemperatureStop(index: number, offset: number): Promise<void> {
    const target = index + offset;
    if (target < 0 || target >= this.plugin.settings.temperatureGradient.length) {
      return;
    }

    this.moveArrayItem(this.plugin.settings.temperatureGradient, index, target);
    await this.plugin.saveSettings();
    this.display();
  }

  private moveArrayItem<T>(items: T[], from: number, to: number): void {
    if (from === to) {
      return;
    }

    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
  }

  private createTableButton(parent: HTMLElement, options: TableButtonOptions): HTMLButtonElement {
    const classes = ["weather-settings__table-button"];
    if (options.variant === "icon") {
      classes.push("weather-settings__table-button--icon");
    }

    const button = parent.createEl("button", {
      text: options.text,
      cls: classes.join(" "),
    }) as HTMLButtonElement;

    button.type = "button";
    if (options.ariaLabel) {
      button.setAttr("aria-label", options.ariaLabel);
    }
    if (options.disabled) {
      button.disabled = true;
    }

    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }
      await options.onClick();
    });

    return button;
  }
}
