import type WeatherPlugin from "../main";
import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { WeatherWidget } from "../ui/weather-widget";

export function registerMarkdownWeatherWidget(plugin: WeatherPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("weather-widget", (source, element, ctx: MarkdownPostProcessorContext) => {
    const widget = new WeatherWidget(plugin);
    widget.mount(element);

    ctx.addChild(new (class extends MarkdownRenderChild {
      constructor(el: HTMLElement, private readonly widgetRef: WeatherWidget) {
        super(el);
      }

      onunload(): void {
        this.widgetRef.unmount();
      }
    })(element, widget));

    const trimmedSource = source.trim();
    if (trimmedSource.length > 0) {
      element.createEl("pre", {
        cls: "weather-widget__debug",
        text: plugin.getStrings().markdown.debugParameters + trimmedSource,
      });
    }
  });
}
