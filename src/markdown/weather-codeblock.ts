import type WeatherPlugin from "../main";
import { WeatherWidget } from "../ui/weather-widget";

export function registerMarkdownWeatherWidget(plugin: WeatherPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("weather-widget", (source, element) => {
    const widget = new WeatherWidget(plugin);
    widget.mount(element);

    const trimmedSource = source.trim();
    if (trimmedSource.length > 0) {
      element.createEl("pre", {
        cls: "weather-widget__debug",
        text: plugin.getStrings().markdown.debugParameters + trimmedSource,
      });
    }
  });
}
