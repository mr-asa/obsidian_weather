import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import type WeatherPlugin from "../main";
import { WeatherWidget } from "../ui/weather-widget";
import type { CityLocation } from "../settings";
import { citySignatureFromValues, makeInlineCityId } from "../utils/city";

const CITY_LINE_REGEX = /^"([^"]+)"\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/;

interface ParsedInlineCities {
  cities: CityLocation[];
  errors: string[];
}

function parseInlineCities(source: string): ParsedInlineCities {
  const cities: CityLocation[] = [];
  const errors: string[] = [];
  const seenSignatures = new Set<string>();
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = CITY_LINE_REGEX.exec(trimmed);
    const lineNumber = i + 1;
    if (!match) {
      errors.push(`Line ${lineNumber}: expected "\"Name\" <latitude> <longitude>"`);
      continue;
    }
    const label = match[1].trim();
    const latitude = Number.parseFloat(match[2]);
    const longitude = Number.parseFloat(match[3]);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.push(`Line ${lineNumber}: latitude must be between -90 and 90.`);
      continue;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.push(`Line ${lineNumber}: longitude must be between -180 and 180.`);
      continue;
    }
    const signature = citySignatureFromValues(label, latitude, longitude);
    if (seenSignatures.has(signature)) {
      continue;
    }
    seenSignatures.add(signature);
    cities.push({
      id: makeInlineCityId(label, latitude, longitude),
      label,
      latitude,
      longitude,
    });
  }
  return { cities, errors };
}

export function registerMarkdownWeatherWidget(plugin: WeatherPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("weather-widget", (source, element, ctx: MarkdownPostProcessorContext) => {
    const parsed = parseInlineCities(source);
    const widget = new WeatherWidget(plugin, { inlineCities: parsed.cities });
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
    const debugLines: string[] = [];
    if (trimmedSource.length > 0) {
      const prefix = plugin.getStrings().markdown.debugParameters;
      const effectivePrefix = prefix.includes("TODO") ? "Inline cities:\n" : prefix;
      debugLines.push(`${effectivePrefix}${trimmedSource}`);
    }
    if (parsed.errors.length > 0) {
      debugLines.push(...parsed.errors);
    }
    if (debugLines.length > 0) {
      element.createEl("pre", {
        cls: "weather-widget__debug",
        text: debugLines.join("\n"),
      });
    }
  });
}
