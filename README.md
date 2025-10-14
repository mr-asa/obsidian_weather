# Weather Widget for Obsidian

Weather Widget brings a live multi-city forecast directly into your Obsidian workspace with a richly themed row layout that mirrors your vault aesthetics. The plugin renders identical widgets in the right sidebar view, Markdown notes, and Canvas, and exposes deep styling controls so you can tune gradients, icons, and sun overlays to match your setup.

## Key Features
- Multi-city forecast rows with automatic time zone handling, sunrise/sunset blending, and temperature-driven gradients.
- Works everywhere: dedicated sidebar view, Markdown code blocks (`\\\weather-widget`), and Canvas placeholders.
- Two weather providers (Open-Meteo by default, OpenWeather with API key support) plus centralized caching to stay inside rate limits.
- Extensive appearance tuning: per-condition icons, time-of-day palettes, sun overlay, and layered gradient controls with instant preview.
- Localization ready (English and Russian) with automatic UI redraw when you switch.
- Command palette actions to open the widget view or drop a Canvas placeholder without leaving your current note.

## Installation
1. Download or clone this repository into your Obsidian plugins directory (e.g. `.obsidian/plugins/obsidian-weather`).
2. In the plugin folder install dependencies and build:
   ```powershell
   npm install
   npm run build
   ```
3. Enable **Weather Widget** inside *Settings -> Community plugins*.

## Usage
- Open the sidebar widget via the **Weather Widget: Open tab** command or by activating the registered view from the right sidebar.
- Embed inside notes with a fenced code block:
  ```markdown
  ```weather-widget
  ```
  ```
- Insert a Canvas placeholder with **Weather Widget: Insert Canvas node**; it drops a ready-to-configure code block at your cursor location.
- Configure everything under *Settings -> Weather Widget*. The widget refreshes automatically whenever settings change.

### Commands
- `Weather Widget: Open tab` — reveals the live widget view (right sidebar by default).
- `Weather Widget: Insert Canvas node` — adds a Canvas text node containing the Markdown code block placeholder.

## Settings Reference

### Localization
- Switch the interface between English and Russian. The settings tab reloads itself instantly so you can continue tweaking without reopening it.
- *Tip:* Match the plugin language to your dominant vault language to keep command names and notices consistent across Obsidian.

### Weather updates
- Choose the data provider, enter or clear an API key (stored per provider), and set the cache/auto-refresh interval.
- Open-Meteo requires no key; OpenWeather does and supports metric units out of the box.
- *Tips:* Keep the cache interval at 10–30 minutes to stay under OpenWeather quotas; bump it shorter only while testing quick style changes. Switching providers automatically updates the cached key and forces a refresh.

### Locations
- Maintain the list of cities shown in the widget. Each row lets you name the location, enter latitude/longitude, reorder, or remove it.
- *Tips:* Enter coordinates in decimal degrees; commas are converted to dots for convenience. Use the arrow buttons to match the on-screen ordering and keep frequently referenced cities near the top.

### Preview playground
- The top preview row mirrors the real widget and updates with every change. Sliders simulate the local time and temperature, while the dropdown swaps between weather categories.
- *Tips:* Move the time slider to dawn/dusk to tune sunrise and sunset gradients, and try extreme temperatures to verify the color ramp still reads well against your theme.

### Time palette
- Pick base colors for morning/day/evening/night and define how many minutes before/after sunrise or sunset each blend begins.
- *Tips:* Extend the sunrise “before” window (e.g. 60–90 minutes) for softer blue-hour transitions, and keep opposing phases distinct to avoid muddy gradients at noon or midnight.

### Sun layer
- Control the sun overlay colors, gradient width, opacity, icon glyph, scale, monospaced alignment, and transition windows.
- *Tips:* Use monospaced icon mode for Unicode symbols (for example `\u2600`) to prevent wobble. Increase the sunrise/sunset "after" values if you want the warm tones to linger longer past golden hour.

### Weather layer
- Assign a color and icon to every weather category (sunny, cloudy, drizzle, etc.) and adjust the layer’s alpha profile, inner opacity ratio, overall opacity, and left edge fade.
- *Tips:* Keep icons to 1–3 characters so they remain centered, and disable the left fade when you want the city label side to stay fully saturated (useful on narrow displays).

### Temperature layer
- Edit the temperature-to-color table, add new stops, drag to reorder, or remove entries. Additional controls mirror the weather layer for alpha profile, inner segment width, opacity, and right-side fade.
- *Tips:* Maintain ascending temperature values for clean interpolation. Use closely spaced stops around critical thresholds (e.g. freezing point) to highlight important regime changes.

### Other options
- Fine-tune the shared edge gradient width, toggle whether to show the local date when it differs from your system day, and set a custom date format (tokens: `dd`, `d`, `MM`, `M`, `yyyy`, `yy`).
- *Tips:* Reduce the edge fraction if your vault theme already adds heavy card padding; expand it to ~0.4 for layouts that need more breathing room. Keep a fallback format like `dd.MM` handy for quick resets.

## Data Providers
- **Open-Meteo** — free, keyless, and best for quick setup.
- **OpenWeather** — requires an API key but offers more granular codes; store the key once and the plugin remembers it per provider.

