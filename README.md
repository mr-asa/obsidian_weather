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

- Insert a Canvas placeholder with **Weather Widget: Insert Canvas node**; it drops a ready-to-configure code block at your cursor location.
- Configure everything under *Settings -> Weather Widget*. The widget refreshes automatically whenever settings change.

### Commands
- `Weather Widget: Open tab` — reveals the live widget view (right sidebar by default).
- `Weather Widget: Insert Canvas node` — adds a Canvas text node containing the Markdown code block placeholder.

## Settings Reference

### Localization
- Switch the interface between English and Russian. This parameter does not affect city names.

### Weather updates
- There are two data providers: Open-Meteo and OpenWeather at the moment. Choose the one you prefer.
  - **Open-Meteo** requires no key
  - **OpenWeather** does, but account is free and limits the number of requests per day.
- Switching providers automatically updates the cached key and forces a refresh.

### Locations
- Maintain the list of cities shown in the widget. Each row lets you name the location, enter latitude/longitude, reorder, or remove it.
    > [!note] 
    > You can use any language, words and symbols for coordinate names.
    > 
    > I added this so you can set convenient names for different locations. For example, I live near a mountain and like to compare the temperature at the summit with the city below. But specifying this exact point by name can be problematic.

### Preview playground
- The top preview row mirrors the real widget and updates with every change. Sliders simulate the local time and temperature, while the dropdown swaps between weather categories.
    > [!note]
    > Small changes to the sliders can be made using the left/right or up/down buttons.

### Time-of-day palette
- Pick base colors for morning/day/evening/night and 
- Define how many minutes before/after sunrise or sunset each blend begins.

### Sun layer
- There are several controls to tune the sun overlay.
    - Colors of day, night and their transitions
    - Alpha profile: choose between profiles to choose best for your theme from "sharp peak with soft edge" to "bubble profile"
    - After choosing the profile, you can fine-tune the width of the gradient and opacity. 
    - If you want to see the sun icon, you can choose between monospaced and regular font. This symbol is used to indicate angle of the sun above the horizon.
    > [!note]
    > Some symbols for sun (of your choice). The basic rule is that the symbol should be equidistant from the top and bottom of the line.
    >
    >    ◯◎◉▪▫▣◇◆-–—►◄▻◅▸◂▹◃⋯Θ•·৹●○⊢⊣
    >
    > For example, you can use the ◯ symbol to show big ring, or use monospaced font and type `—•—` for accurate horisontal symbol.
    >
    > Ore you can delete the icon completely.
- By analogy with the time of day and night, you can choose the time of color change and the gradient of the sun itself.

### Weather layer
- Assign a color and icon to every weather category (sunny, cloudy, drizzle, etc.) and 
- Adjust the layer’s alpha profile, inner opacity ratio, overall opacity, and left edge fade.

### Temperature layer
- Edit the temperature-to-color table, add new stops, drag to reorder, or remove entries. 
- Additional controls mirror the weather layer for alpha profile, inner segment width, opacity, and right-side fade.

### Other options
- Edge gradient width - global setting for Wether and Temperature layers. You can set small values for small indicators of weater and temperature for solid day/night backgrounds. 
    > [!note]
    > The most inquisitive users may notice that when setting a clear boundary for weather or temperature transitions, they may not match in width in different cities. And you would be right. I decided to break this series down into small differences, showing the difference in daylight hours.



