import { DEFAULT_LOCALE, type LocaleCode } from "./types";
import type { TimeOfDayKey, WeatherCategory } from "../settings";

export interface LocaleStrings {
  languageNames: Record<LocaleCode, string>;
  settings: {
    localization: {
      heading: string;
      languageLabel: string;
      languageDescription: string;
    };
    refresh: {
      heading: string;
      description: string;
      autoRefreshLabel: string;
      autoRefreshDescription: string;
      cacheLabel: string;
      cacheDescription: string;
    };
    preview: {
      heading: string;
      description: string;
      timeLabel: string;
      timeHint: string;
      temperatureLabel: string;
      temperatureHint: string;
      weatherLabel: string;
      weatherHint: string;
      sampleCity: string;
      sampleDate: string;
    };
    locations: {
      heading: string;
      description: string;
      tableHeaders: {
        label: string;
        latitude: string;
        longitude: string;
        actions: string;
      };
      addButtonLabel: string;
      emptyState: string;
      defaultLabel: string;
    };
    timePalette: {
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
    sunLayer: {
      heading: string;
      description: string;
      sunriseColor: string;
      dayColor: string;
      nightColor: string;
      transitionLabel: string;
      widthLabel: string;
      softnessInnerLabel: string;
      softnessOuterLabel: string;
      twilightHighlightLabel: string;
      dayHighlightLabel: string;
      nightHighlightLabel: string;
      dayAlphaLabel: string;
      nightAlphaLabel: string;
    };
    gradients: {
      heading: string;
      description: string;
      time: {
        title: string;
        mixRatio: string;
        padding: string;
        widthMin: string;
        widthMax: string;
        peakAlpha: string;
        edgeAlpha: string;
        steps: string;
        power: string;
      };
      weather: {
        title: string;
        padding: string;
        widthMin: string;
        widthMax: string;
        peakScale: string;
        edgeScale: string;
        steps: string;
        power: string;
      };
      temperature: {
        title: string;
        start: string;
        end: string;
        peakAlpha: string;
        edgeAlpha: string;
        steps: string;
        power: string;
      };
    };
    display: {
      heading: string;
      description: string;
      verticalFadeTop: string;
      verticalFadeMiddle: string;
      leftPanelWidth: string;
      leftPanelHighlight: string;
      daySpanMin: string;
      daySpanMax: string;
      showDateLabel: string;
      showDateDescription: string;
    };
  };
  actions: {
    remove: string;
    moveUp: string;
    moveDown: string;
    reset: string;
  };
  sunPhases: Record<TimeOfDayKey, string>;
  weatherConditions: Record<WeatherCategory, string>;
  notices: {
    openCanvasFirst: string;
    canvasCreationFailed: string;
    canvasPlaceholderAdded: string;
  };
  widget: {
    forecastPlaceholder: string;
    loadingLabel: string;
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
      refresh: {
        heading: "Updates",
        description: "Choose how often the plugin refreshes weather data and how long cached responses stay valid.",
        autoRefreshLabel: "Refresh interval (minutes)",
        autoRefreshDescription: "The widget asks the weather service on this cadence.",
        cacheLabel: "Cache lifetime (minutes)",
        cacheDescription: "Avoid excessive requests by reusing recent data.",
      },
      preview: {
        heading: "Preview widget",
        description: "Adjust sample conditions to see how gradients blend together.",
        timeLabel: "Local time",
        timeHint: "Slide through the day to see sun highlights.",
        temperatureLabel: "Temperature (°C)",
        temperatureHint: "Values outside the scale are clamped.",
        weatherLabel: "Weather",
        weatherHint: "Uses the palette color and icon for the selected condition.",
        sampleCity: "Sample City",
        sampleDate: "24 Sep",
      },
      locations: {
        heading: "Locations",
        description: "Add the places you want to monitor. Use decimal degrees for coordinates.",
        tableHeaders: {
          label: "Label",
          latitude: "Latitude",
          longitude: "Longitude",
          actions: "",
        },
        addButtonLabel: "Add location",
        emptyState: "No locations configured yet.",
        defaultLabel: "New location",
      },
      timePalette: {
        heading: "Time-of-day colors",
        description: "Tune base and highlight colors used for sunrise, day, evening, and night.",
      },
      weatherPalette: {
        heading: "Weather palette",
        description: "Pick the color and icon for each weather category.",
      },
      temperatureGradient: {
        heading: "Temperature gradient",
        description: "Define color stops that map to specific °C values.",
        addButtonLabel: "Add stop",
        tableHeaders: {
          temperature: "Temperature (°C)",
          color: "Color",
        },
      },
      sunLayer: {
        heading: "Sun overlay",
        description: "Control the glowing spotlight that represents the sun's position.",
        sunriseColor: "Sunrise color",
        dayColor: "Day color",
        nightColor: "Night color",
        transitionLabel: "Transition duration (minutes)",
        widthLabel: "Sun beam width",
        softnessInnerLabel: "Inner softness",
        softnessOuterLabel: "Outer softness",
        twilightHighlightLabel: "Twilight highlight",
        dayHighlightLabel: "Day highlight",
        nightHighlightLabel: "Night highlight",
        dayAlphaLabel: "Day opacity (peak / mid / low)",
        nightAlphaLabel: "Night opacity (peak / mid / low)",
      },
      gradients: {
        heading: "Layer gradients",
        description: "Fine tune how each background layer blends across the row. The shared preview bar above updates instantly.",
        time: {
          title: "Time layer",
          mixRatio: "Time layer mix ratio",
          padding: "Time layer padding",
          widthMin: "Time width minimum",
          widthMax: "Time width maximum",
          peakAlpha: "Time peak alpha",
          edgeAlpha: "Time edge alpha",
          steps: "Time gradient steps",
          power: "Time easing power",
        },
        weather: {
          title: "Weather layer",
          padding: "Weather layer padding",
          widthMin: "Weather width minimum",
          widthMax: "Weather width maximum",
          peakScale: "Weather peak scale",
          edgeScale: "Weather edge scale",
          steps: "Weather gradient steps",
          power: "Weather easing power",
        },
        temperature: {
          title: "Temperature layer",
          start: "Temperature gradient start",
          end: "Temperature gradient end",
          peakAlpha: "Temperature peak alpha",
          edgeAlpha: "Temperature edge alpha",
          steps: "Temperature gradient steps",
          power: "Temperature easing power",
        },
      },
      display: {
        heading: "Display",
        description: "Adjust auxiliary effects and date behaviour.",
        verticalFadeTop: "Vertical fade (top)",
        verticalFadeMiddle: "Vertical fade (middle)",
        leftPanelWidth: "Highlight panel width",
        leftPanelHighlight: "Minimum highlight intensity",
        daySpanMin: "Minimum day span",
        daySpanMax: "Maximum day span",
        showDateLabel: "Show date when different",
        showDateDescription: "Append the local date whenever it differs from your current day.",
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
      sunny: "Sunny",
      cloudy: "Cloudy",
      rainy: "Rain",
      snowy: "Snow",
      drizzle: "Drizzle",
      storm: "Thunderstorm",
      foggy: "Fog",
    },
    notices: {
      openCanvasFirst: "Open a Canvas file before inserting the widget.",
      canvasCreationFailed: "Unable to create a Canvas node. Please verify your Obsidian version.",
      canvasPlaceholderAdded: "Widget placeholder added to the Canvas.",
    },
    widget: {
      forecastPlaceholder: "Forecast will appear here",
      loadingLabel: "Loading...",
    },
    markdown: {
      debugParameters: "TODO: handle block parameters - ",
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
        languageDescription: "Переключайте плагин между русским и английским языками.",
      },
      refresh: {
        heading: "Обновление",
        description: "Настройте частоту обновления и время хранения закэшированных данных.",
        autoRefreshLabel: "Интервал запроса (мин)",
        autoRefreshDescription: "С какой периодичностью виджет обращается к сервису погоды.",
        cacheLabel: "Время жизни кеша (мин)",
        cacheDescription: "Переиспользуйте свежие ответы, чтобы не перегружать API.",
      },
      preview: {
        heading: "Виртуальный виджет",
        description: "Проверьте, как градиенты взаимодействуют при разных условиях.",
        timeLabel: "Локальное время",
        timeHint: "Двигайте ползунок, чтобы увидеть подсветку солнца.",
        temperatureLabel: "Температура (°C)",
        temperatureHint: "Значения вне диапазона будут ограничены.",
        weatherLabel: "Погода",
        weatherHint: "Используется цвет и иконка выбранного состояния.",
        sampleCity: "Город",
        sampleDate: "24 сен",
      },
      locations: {
        heading: "Локации",
        description: "Добавьте интересующие вас города. Координаты указывайте в градусах с десятичной частью.",
        tableHeaders: {
          label: "Название",
          latitude: "Широта",
          longitude: "Долгота",
          actions: "",
        },
        addButtonLabel: "Добавить локацию",
        emptyState: "Локации пока не добавлены.",
        defaultLabel: "Новая локация",
      },
      timePalette: {
        heading: "Цвета по времени суток",
        description: "Настройте основную и акцентную палитру для рассвета, дня, вечера и ночи.",
      },
      weatherPalette: {
        heading: "Цвета погодных условий",
        description: "Выберите цвет и иконку для каждого типа погоды.",
      },
      temperatureGradient: {
        heading: "Градиент температур",
        description: "Определите соответствие цветов и температур (°C).",
        addButtonLabel: "Добавить точку",
        tableHeaders: {
          temperature: "Температура (°C)",
          color: "Цвет",
        },
      },
      sunLayer: {
        heading: "Солнечное свечение",
        description: "Параметры светового пятна, показывающего положение солнца.",
        sunriseColor: "Цвет рассвета",
        dayColor: "Дневной цвет",
        nightColor: "Ночной цвет",
        transitionLabel: "Длительность перехода (мин)",
        widthLabel: "Ширина луча",
        softnessInnerLabel: "Мягкость внутри",
        softnessOuterLabel: "Мягкость снаружи",
        twilightHighlightLabel: "Подсветка сумерек",
        dayHighlightLabel: "Подсветка дня",
        nightHighlightLabel: "Подсветка ночи",
        dayAlphaLabel: "Яркость дня (пик / середина / края)",
        nightAlphaLabel: "Яркость ночи (пик / середина / края)",
      },
      gradients: {
        heading: "Градиенты слоёв",
        description: "Настройте переходы фоновых слоев. Общая панель предпросмотра выше обновляется мгновенно.",
        time: {
          title: "Слой времени",
          mixRatio: "Смешение слоя времени",
          padding: "Отступ слоя времени",
          widthMin: "Минимальная ширина",
          widthMax: "Максимальная ширина",
          peakAlpha: "Пиковая непрозрачность",
          edgeAlpha: "Непрозрачность краёв",
          steps: "Количество шагов",
          power: "Кривая ослабления",
        },
        weather: {
          title: "Слой погоды",
          padding: "Отступ погодного слоя",
          widthMin: "Мин. ширина",
          widthMax: "Макс. ширина",
          peakScale: "Пиковый множитель",
          edgeScale: "Множитель краёв",
          steps: "Шагов",
          power: "Кривая ослабления",
        },
        temperature: {
          title: "Слой температуры",
          start: "Начало температурного слоя",
          end: "Конец температурного слоя",
          peakAlpha: "Пиковая непрозрачность",
          edgeAlpha: "Непрозрачность краёв",
          steps: "Шагов",
          power: "Кривая ослабления",
        },
      },
      display: {
        heading: "Отображение",
        description: "Настройте дополнительные эффекты и поведение даты.",
        verticalFadeTop: "Вертикальное затемнение (сверху)",
        verticalFadeMiddle: "Вертикальное затемнение (центр)",
        leftPanelWidth: "Ширина подсветки слева",
        leftPanelHighlight: "Минимальная интенсивность подсветки",
        daySpanMin: "Мин. доля дневного времени",
        daySpanMax: "Макс. доля дневного времени",
        showDateLabel: "Показывать дату, если отличается",
        showDateDescription: "Добавлять локальную дату, когда она не совпадает с текущей.",
      },
    },
    actions: {
      remove: "Удалить",
      moveUp: "Вверх",
      moveDown: "Вниз",
      reset: "Сбросить",
    },
    sunPhases: {
      morning: "Утро",
      day: "День",
      evening: "Вечер",
      night: "Ночь",
    },
    weatherConditions: {
      sunny: "Ясно",
      cloudy: "Облачно",
      rainy: "Дождь",
      snowy: "Снег",
      drizzle: "Морось",
      storm: "Гроза",
      foggy: "Туман",
    },
    notices: {
      openCanvasFirst: "Откройте Canvas перед добавлением виджета.",
      canvasCreationFailed: "Не удалось создать узел Canvas. Проверьте версию Obsidian.",
      canvasPlaceholderAdded: "Заглушка виджета добавлена на Canvas.",
    },
    widget: {
      forecastPlaceholder: "Прогноз появится здесь",
      loadingLabel: "Загрузка...",
    },
    markdown: {
      debugParameters: "TODO: обработать параметры блока - ",
    },
    commands: {
      openTab: "Открыть вкладку с виджетом",
      insertCanvas: "Добавить виджет на Canvas",
    },
    view: {
      title: "Погодный виджет",
    },
  },

};

export function getLocaleStrings(locale: LocaleCode): LocaleStrings {
  return LOCALE_STRINGS[locale] ?? LOCALE_STRINGS[DEFAULT_LOCALE];
}

