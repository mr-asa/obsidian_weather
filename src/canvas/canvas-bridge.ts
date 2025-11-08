import { ItemView, Notice } from "obsidian";
import type WeatherPlugin from "../main";

interface CanvasTextNodeOptions {
  text: string;
  pos: { x: number; y: number };
  size?: { width?: number; height?: number };
}

type CanvasView = {
  canvas?: {
    createTextNode?: (options: CanvasTextNodeOptions) => { id: string };
    requestSave?: () => void;
  };
  getViewType: () => string;
};

export class CanvasBridge {
  constructor(private readonly plugin: WeatherPlugin) {}

  insertWidgetPlaceholder(): void {
    const strings = this.plugin.getStrings();
    const canvasView = this.getActiveCanvasView();
    if (!canvasView) {
      new Notice(strings.notices.openCanvasFirst);
      return;
    }

    const node = canvasView.canvas?.createTextNode?.({
      text: "```weather-widget\n```\n",
      pos: { x: 200, y: 200 },
      size: { width: 320, height: 200 },
    });

    if (!node) {
      new Notice(strings.notices.canvasCreationFailed);
      return;
    }

    canvasView.canvas?.requestSave?.();
    new Notice(strings.notices.canvasPlaceholderAdded);
  }

  private getActiveCanvasView(): CanvasView | null {
    const view = this.plugin.app.workspace.getActiveViewOfType(ItemView);
    if (!view || view.getViewType() !== "canvas") {
      return null;
    }
    return view as unknown as CanvasView;
  }

  unregister(): void {
    // No subscriptions yet, but the hook is ready for future logic.
  }
}
