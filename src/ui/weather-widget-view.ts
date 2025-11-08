import { ItemView, WorkspaceLeaf } from "obsidian";
import type WeatherPlugin from "../main";
import { WeatherWidget } from "./weather-widget";

export const WEATHER_WIDGET_VIEW_TYPE = "weather-widget";

export class WeatherWidgetView extends ItemView {
  private readonly plugin: WeatherPlugin;
  private readonly widget: WeatherWidget;

  constructor(leaf: WorkspaceLeaf, plugin: WeatherPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.widget = new WeatherWidget(plugin);
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

  onOpen(): Promise<void> {
    this.widget.mount(this.containerEl);
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.widget.unmount();
    this.containerEl.empty();
    return Promise.resolve();
  }

  refresh(): void {
    this.widget.update();
  }
}
