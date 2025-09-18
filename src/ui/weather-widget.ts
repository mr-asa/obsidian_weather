import type { WeatherWidgetSettings, SunCycleKey } from "../settings";

interface Segment {
  key: SunCycleKey;
  cssClass: string;
}

const SEGMENTS: Segment[] = [
  { key: "morning", cssClass: "weather-widget__segment--morning" },
  { key: "day", cssClass: "weather-widget__segment--day" },
  { key: "evening", cssClass: "weather-widget__segment--evening" },
  { key: "night", cssClass: "weather-widget__segment--night" },
];

export class WeatherWidget {
  private host: HTMLElement | null = null;

  mount(
    containerEl: HTMLElement,
    settings: WeatherWidgetSettings,
    labels: Record<SunCycleKey, string>,
    footerText: string,
  ): void {
    this.host = containerEl;
    this.render(settings, labels, footerText);
  }

  update(
    settings: WeatherWidgetSettings,
    labels: Record<SunCycleKey, string>,
    footerText: string,
  ): void {
    if (!this.host) {
      return;
    }

    this.render(settings, labels, footerText);
  }

  private render(
    settings: WeatherWidgetSettings,
    labels: Record<SunCycleKey, string>,
    footerText: string,
  ): void {
    if (!this.host) {
      return;
    }

    this.host.replaceChildren();
    const wrapper = this.host.createDiv({ cls: "weather-widget" });

    SEGMENTS.forEach((segment) => {
      const segmentEl = wrapper.createDiv({ cls: ["weather-widget__segment", segment.cssClass].join(" ") });
      segmentEl.style.setProperty("--weather-segment-color", settings.sunCycleColors[segment.key]);
      segmentEl.style.setProperty("--weather-segment-background", settings.sunCycleBackgrounds[segment.key]);
      segmentEl.style.setProperty("--weather-sun-gradient-width", `${settings.sunGradientWidthPercent}%`);
      segmentEl.createEl("span", { text: labels[segment.key], cls: "weather-widget__label" });
    });

    wrapper.createDiv({
      cls: "weather-widget__footer",
      text: footerText,
    });
  }
}