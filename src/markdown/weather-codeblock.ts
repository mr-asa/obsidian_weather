import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import type WeatherPlugin from "../main";
import { WeatherWidget } from "../ui/weather-widget";
import type { CityLocation } from "../settings";
import { citySignatureFromValues, makeInlineCityId } from "../utils/city";

const CITY_LINE_REGEX = /^"([^"]+)"\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/;

interface ParsedInlineCities {
  cities: CityLocation[];
  errors: string[];
  rowHeight: number | null;
}

function parseInlineCities(source: string): ParsedInlineCities {
  const cities: CityLocation[] = [];
  const errors: string[] = [];
  const seenSignatures = new Set<string>();
  const lines = source.split(/\r?\n/);
  let rowHeight: number | null = null;
  const heightDirective = /^\s*(?:row-?height|height)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(px)?\s*$/i;
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const directiveMatch = heightDirective.exec(trimmed);
    if (directiveMatch) {
      const value = Number.parseFloat(directiveMatch[1]);
      if (Number.isFinite(value) && value > 0) {
        rowHeight = value;
      } else {
        errors.push(`Line ${i + 1}: row height must be a positive number.`);
      }
      continue;
    }
    const match = CITY_LINE_REGEX.exec(trimmed);
    const lineNumber = i + 1;
    if (!match) {
      errors.push(`Line ${lineNumber}: expected "Name" <latitude> <longitude>`);
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
  return { cities, errors, rowHeight };
}

export function registerMarkdownWeatherWidget(plugin: WeatherPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("weather-widget", (source, element, ctx: MarkdownPostProcessorContext) => {
    const parsed = parseInlineCities(source);
    const options = {
      inlineCities: parsed.cities,
      rowHeight: parsed.rowHeight ?? undefined,
    };
    WeatherWidget.renderIntoHost(plugin, element, options);
    void plugin.refreshInlineCities(parsed.cities);

    ctx.addChild(new (class extends MarkdownRenderChild {
      constructor(el: HTMLElement) {
        super(el);
      }

      onunload(): void {
        this.containerEl.classList.remove("ow-widget-host");
        this.containerEl.replaceChildren();
        delete this.containerEl.dataset.owInlineCities;
        delete this.containerEl.dataset.owRowHeight;
      }
    })(element));

    const trimmedSource = source.trim();
    if (parsed.errors.length > 0) {
      const debugLines: string[] = [];
      if (trimmedSource.length > 0) {
        const prefix = plugin.getStrings().markdown.debugParameters;
        const effectivePrefix = prefix.includes("TODO") ? "Inline cities:\n" : prefix;
        debugLines.push(`${effectivePrefix}${trimmedSource}`);
      }
      if (parsed.rowHeight != null && Number.isFinite(parsed.rowHeight)) {
        debugLines.push(`Row height: ${parsed.rowHeight}px`);
      }
      debugLines.push(...parsed.errors);
      if (debugLines.length > 0) {
        element.createEl("pre", {
          cls: "weather-widget__debug",
          text: debugLines.join("\n"),
        });
      }
    }
  });
}
