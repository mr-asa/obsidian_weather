import type WeatherPlugin from "../main";
import { CanvasBridge } from "../canvas/canvas-bridge";

export function registerCommands(plugin: WeatherPlugin, canvasBridge: CanvasBridge): void {
  const strings = plugin.getStrings();

  plugin.addCommand({
    id: "open-tab",
    name: strings.commands.openTab,
    callback: () => {
      void plugin.activateView();
    },
  });

  plugin.addCommand({
    id: "insert-canvas",
    name: strings.commands.insertCanvas,
    callback: () => {
      canvasBridge.insertWidgetPlaceholder();
    },
  });
}
