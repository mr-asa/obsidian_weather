import { DEFAULT_LOCALE, type LocaleCode } from "./types";
import type { SunCycleKey, WeatherConditionKey } from "../settings";

export interface LocaleStrings {
  languageNames: Record<LocaleCode, string>;
  settings: {
    localization: {
      heading: string;
      languageLabel: string;
      languageDescription: string;
    };
    api: {
      heading: string;
      apiKeyLabel: string;
      apiKeyDescription: string;
      apiKeyPlaceholder: string;
    };
    locations: {
      heading: string;
      description: string;
      tableHeaders: {
        name: string;
        latitude: string;
        longitude: string;
      };
      addButtonLabel: string;
      emptyState: string;
    };
    sunColors: {
      heading: string;
      description: string;
      widthLabel: string;
    };
    sunBackgrounds: {
      heading: string;
      description: string;
    };
    weatherPalette: {
      heading: string;
      description: string;
    };
    temperatureGradient: {
      heading: string;
      description: string;
      addButtonLabel: string;
      tableHeaders: {
        temperature: string;
        color: string;
      };
    };
  };
  actions: {
    remove: string;
    moveUp: string;
    moveDown: string;
    reset: string;
  };
  sunPhases: Record<SunCycleKey, string>;
  weatherConditions: Record<WeatherConditionKey, string>;
  notices: {
    openCanvasFirst: string;
    canvasCreationFailed: string;
    canvasPlaceholderAdded: string;
  };
  widget: {
    forecastPlaceholder: string;
  };
  markdown: {
    debugParameters: string;
  };
  commands: {
    openTab: string;
    insertCanvas: string;
  };
  view: {
    title: string;
  };
}

export const LOCALE_STRINGS: Record<LocaleCode, LocaleStrings> = {
  en: {
    languageNames: {
      en: "English",
      ru: "Russian",
    },
    settings: {
      localization: {
        heading: "Localization",
        languageLabel: "Interface language",
        languageDescription: "Switch the plugin UI between Russian and English.",
      },
      api: {
        heading: "Weather provider",
        apiKeyLabel: "OpenWeather API key",
        apiKeyDescription: "Paste the OpenWeather key that will authorize forecast requests.",
        apiKeyPlaceholder: "Enter API key",
      },
      locations: {
        heading: "Locations",
        description: "Add the settlements you want to monitor. Use any language you prefer.",
        tableHeaders: {
          name: "Name",
          latitude: "Latitude",
          longitude: "Longitude",
        },
        addButtonLabel: "Add location",
        emptyState: "No locations yet.",
      },
      sunColors: {
        heading: "Sun colors",
        description: "Configure colors for different times of day.",
        widthLabel: "Sun gradient width (%)",
      },
      sunBackgrounds: {
        heading: "Background colors",
        description: "Pick base row colors for each part of the day.",
      },
      weatherPalette: {
        heading: "Weather palette",
        description: "Customize colors used for different weather conditions.",
      },
      temperatureGradient: {
        heading: "Temperature gradient",
        description: "Provide color stops for temperatures between -60 and +60 Celsius.",
        addButtonLabel: "Add color stop",
        tableHeaders: {
          temperature: "Temperature (C)",
          color: "Color",
        },
      },
    },
    actions: {
      remove: "Remove",
      moveUp: "Move up",
      moveDown: "Move down",
      reset: "Reset",
    },
    sunPhases: {
      morning: "Morning",
      day: "Day",
      evening: "Evening",
      night: "Night",
    },
    weatherConditions: {
      clear: "Clear sky",
      partlyCloudy: "Partly cloudy",
      cloudy: "Cloudy",
      rain: "Rain",
      thunderstorm: "Thunderstorm",
      snow: "Snow",
      fog: "Fog",
    },
    notices: {
      openCanvasFirst: "Open a Canvas file before inserting the widget.",
      canvasCreationFailed: "Unable to create a Canvas node. Please verify your Obsidian version.",
      canvasPlaceholderAdded: "Widget placeholder added to the Canvas.",
    },
    widget: {
      forecastPlaceholder: "Forecast will appear here",
    },
    markdown: {
      debugParameters: "TODO: handle block parameters — ",
    },
    commands: {
      openTab: "Open weather widget tab",
      insertCanvas: "Add weather widget to Canvas",
    },
    view: {
      title: "Weather widget",
    },
  },
  ru: {
    languageNames: {
      en: "Английский",
      ru: "Русский",
    },
    settings: {
      localization: {
        heading: "Локализация",
        languageLabel: "Язык интерфейса",
        languageDescription: "Переключайте интерфейс плагина между русским и английским языками.",
      },
      api: {
        heading: "Провайдер погоды",
        apiKeyLabel: "API ключ OpenWeather",
        apiKeyDescription: "Вставьте ключ OpenWeather, который будет использоваться для запросов прогноза.",
        apiKeyPlaceholder: "Введите API ключ",
      },
      locations: {
        heading: "Населенные пункты",
        description: "Добавьте интересующие населенные пункты. Название можете записать на любом языке.",
        tableHeaders: {
          name: "Название",
          latitude: "Широта",
          longitude: "Долгота",
        },
        addButtonLabel: "Добавить населенный пункт",
        emptyState: "Список пока пуст.",
      },
      sunColors: {
        heading: "Цвета солнца",
        description: "Настройте цвета для разных часов суток.",
        widthLabel: "Ширина солнечного градиента (%)",
      },
      sunBackgrounds: {
        heading: "Фоновые цвета",
        description: "Выберите базовые цвета строки для каждого времени суток.",
      },
      weatherPalette: {
        heading: "Погодная палитра",
        description: "Настройте цвета для разных погодных условий.",
      },
      temperatureGradient: {
        heading: "Температурный градиент",
        description: "Укажите цветовые точки для температур от -60 до +60 градусов Цельсия.",
        addButtonLabel: "Добавить точку",
        tableHeaders: {
          temperature: "Температура (C)",
          color: "Цвет",
        },
      },
    },
    actions: {
      remove: "Удалить",
      moveUp: "Выше",
      moveDown: "Ниже",
      reset: "Сбросить",
    },
    sunPhases: {
      morning: "Утро",
      day: "День",
      evening: "Вечер",
      night: "Ночь",
    },
    weatherConditions: {
      clear: "Ясно",
      partlyCloudy: "Переменная облачность",
      cloudy: "Пасмурно",
      rain: "Дождь",
      thunderstorm: "Гроза",
      snow: "Снег",
      fog: "Туман",
    },
    notices: {
      openCanvasFirst: "Откройте файл Canvas, чтобы вставить виджет.",
      canvasCreationFailed: "Не удалось создать узел Canvas. Проверьте версию Obsidian.",
      canvasPlaceholderAdded: "Заготовка виджета добавлена на Canvas.",
    },
    widget: {
      forecastPlaceholder: "Здесь появится прогноз погоды",
    },
    markdown: {
      debugParameters: "TODO: обработать параметры блока — ",
    },
    commands: {
      openTab: "Открыть погодный виджет во вкладке",
      insertCanvas: "Добавить погодный виджет на Canvas",
    },
    view: {
      title: "Погодный виджет",
    },
  },
};

export function getLocaleStrings(locale: LocaleCode): LocaleStrings {
  return LOCALE_STRINGS[locale] ?? LOCALE_STRINGS[DEFAULT_LOCALE];
}
