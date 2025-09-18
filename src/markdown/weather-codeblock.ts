import type WeatherPlugin from "../main";
import { WeatherWidget } from "../ui/weather-widget";

export function registerMarkdownWeatherWidget(plugin: WeatherPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("weather-widget", (source, element) => {
    const strings = plugin.getStrings();
    const widget = new WeatherWidget();
    widget.mount(element, plugin.settings, strings.sunPhases, strings.widget.forecastPlaceholder);

    const trimmedSource = source.trim();
    if (trimmedSource.length > 0) {
      element.createEl("pre", {
        cls: "weather-widget__debug",
        text: strings.markdown.debugParameters + trimmedSource,
      });
    }
  });
}