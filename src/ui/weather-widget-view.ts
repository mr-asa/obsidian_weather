import { ItemView, WorkspaceLeaf } from "obsidian";
import type WeatherPlugin from "../main";
import { WeatherWidget } from "./weather-widget";

export const WEATHER_WIDGET_VIEW_TYPE = "weather-widget";

export class WeatherWidgetView extends ItemView {
  private readonly plugin: WeatherPlugin;
  private readonly widget = new WeatherWidget();

  constructor(leaf: WorkspaceLeaf, plugin: WeatherPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WEATHER_WIDGET_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.getStrings().view.title;
  }

  getIcon(): string {
    return "cloud";
  }

  async onOpen(): Promise<void> {
    const strings = this.plugin.getStrings();
    this.widget.mount(this.containerEl, this.plugin.settings, strings.sunPhases, strings.widget.forecastPlaceholder);
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  refresh(): void {
    const strings = this.plugin.getStrings();
    this.widget.update(this.plugin.settings, strings.sunPhases, strings.widget.forecastPlaceholder);
  }
}