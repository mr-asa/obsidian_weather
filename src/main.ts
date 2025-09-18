import { Plugin, WorkspaceLeaf } from "obsidian";
import { CanvasBridge } from "./canvas/canvas-bridge";
import { registerCommands } from "./commands";
import { registerMarkdownWeatherWidget } from "./markdown/weather-codeblock";
import { DEFAULT_SETTINGS, WeatherWidgetSettings } from "./settings";
import { WeatherSettingsTab } from "./settings-tab";
import { WEATHER_WIDGET_VIEW_TYPE, WeatherWidgetView } from "./ui/weather-widget-view";
import { getLocaleStrings, type LocaleStrings } from "./i18n/strings";
import type { LocaleCode } from "./i18n/types";
import { createId } from "./utils/id";

export default class WeatherPlugin extends Plugin {
  settings: WeatherWidgetSettings;
  private canvasBridge: CanvasBridge | null = null;
  private locale: LocaleCode;
  private strings: LocaleStrings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(WEATHER_WIDGET_VIEW_TYPE, (leaf) => new WeatherWidgetView(leaf, this));

    this.canvasBridge = new CanvasBridge(this);
    registerCommands(this, this.canvasBridge);
    registerMarkdownWeatherWidget(this);

    this.addSettingTab(new WeatherSettingsTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(WEATHER_WIDGET_VIEW_TYPE);
    this.canvasBridge?.unregister();
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

  private applyLocalization(): void {
    this.locale = this.settings.language;
    this.strings = getLocaleStrings(this.locale);
  }

  private normalizeSettings(): void {
    if (!Array.isArray(this.settings.cities)) {
      this.settings.cities = [];
    }

    this.settings.cities = this.settings.cities.map((city) => {
      const legacy = city as Partial<WeatherWidgetSettings["cities"][number]> & {
        names?: Record<string, string>;
      };

      const name = typeof legacy?.name === "string" && legacy.name.length > 0
        ? legacy.name
        : legacy?.names
        ? Object.values(legacy.names).find((value) => value.length > 0) ?? ""
        : "";

      return {
        id: legacy?.id ?? createId("city"),
        name,
        latitude: typeof legacy?.latitude === "number" ? legacy.latitude : 0,
        longitude: typeof legacy?.longitude === "number" ? legacy.longitude : 0,
      };
    });

    const defaults = DEFAULT_SETTINGS;

    if (!this.settings.sunCycleBackgrounds) {
      this.settings.sunCycleBackgrounds = { ...defaults.sunCycleBackgrounds };
    } else {
      (Object.keys(defaults.sunCycleBackgrounds) as Array<keyof typeof defaults.sunCycleBackgrounds>).forEach((key) => {
        if (typeof this.settings.sunCycleBackgrounds[key] !== "string") {
          this.settings.sunCycleBackgrounds[key] = defaults.sunCycleBackgrounds[key];
        }
      });
    }

    if (!this.settings.sunCycleColors) {
      this.settings.sunCycleColors = { ...defaults.sunCycleColors };
    } else {
      (Object.keys(defaults.sunCycleColors) as Array<keyof typeof defaults.sunCycleColors>).forEach((key) => {
        if (typeof this.settings.sunCycleColors[key] !== "string") {
          this.settings.sunCycleColors[key] = defaults.sunCycleColors[key];
        }
      });
    }

    if (!this.settings.weatherConditionPalette) {
      this.settings.weatherConditionPalette = { ...defaults.weatherConditionPalette };
    } else {
      (Object.keys(defaults.weatherConditionPalette) as Array<keyof typeof defaults.weatherConditionPalette>).forEach((key) => {
        if (typeof this.settings.weatherConditionPalette[key] !== "string") {
          this.settings.weatherConditionPalette[key] = defaults.weatherConditionPalette[key];
        }
      });
    }

    if (typeof this.settings.sunGradientWidthPercent !== "number" || Number.isNaN(this.settings.sunGradientWidthPercent)) {
      this.settings.sunGradientWidthPercent = defaults.sunGradientWidthPercent;
    }
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
  }
}