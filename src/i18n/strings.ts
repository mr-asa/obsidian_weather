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
    widgetUpdates: {
      heading: string;
      description: string;
      providerLabel: string;
      providerHint: string;
      providerOptions: Record<string, string>;
      apiKeyLabel: string;
      apiKeyPlaceholder: string;
      apiKeyDescriptions: Record<string, string>;
      intervalLabel: string;
      intervalHint: string;
    };
    alphaProfiles: Record<string, string>;
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
    weatherLayer: {
      heading: string;
      description: string;
      alphaProfileLabel: string;
      innerWidthLabel: string;
      opacityScaleLabel: string;
      disableLeftLabel: string;
    };
    temperatureLayer: {
      heading: string;
      description: string;
      addButtonLabel: string;
      tableHeaders: {
        temperature: string;
        color: string;
      };
      alphaProfileLabel: string;
      innerWidthLabel: string;
      opacityScaleLabel: string;
      disableRightLabel: string;
    };
    sunLayer: {
      heading: string;
      description: string;
      colors: {
        night: string;
        sunrise: string;
        day: string;
        sunset: string;
      };
      alphaProfileLabel: string;
      gradientWidthLabel: string;
      innerWidthLabel: string;
      opacityScaleLabel: string;
      iconLabel: string;
      iconScaleLabel: string;
      transitionsLabel: string;
      transitionsHint: string;
      sunriseLabel: string;
      sunsetLabel: string;
      sunriseBeforeLabel: string;
      sunriseAfterLabel: string;
      sunsetBeforeLabel: string;
      sunsetAfterLabel: string;
    };
    gradients: {
      heading: string;
      description: string;
      edgeWidthLabel: string;
      edgeWidthHint: string;
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
    other: {
      heading: string;
      description: string;
      showDateLabel: string;
      showDateDescription: string;
    };
    reset: {
      heading: string;
      description: string;
      confirm: string;
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
      widgetUpdates: {
        heading: "Widget updates",
        description: "Configure the data source and when cached data expires.",
        providerLabel: "Weather provider",
        providerHint: "Select which service supplies the forecast.",
        providerOptions: {
          "open-meteo": "Open-Meteo",
          "openweathermap": "OpenWeatherMap",
        },
        apiKeyDescriptions: {
          "open-meteo": "Open-Meteo works without an API key.",
          "openweathermap": "OpenWeatherMap requires a personal API key from your account.",
        },
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "Optional token",
        intervalLabel: "Cache refresh (minutes)",
        intervalHint: "Refresh cached data after this many minutes.",
      },
      alphaProfiles: {
        sineIn: "Sine – ease in",
        sineOut: "Sine – ease out",
        sineInOut: "Sine – ease in/out",
        quadIn: "Quad – ease in",
        quadOut: "Quad – ease out",
        quadInOut: "Quad – ease in/out",
        cubicIn: "Cubic – ease in",
        cubicOut: "Cubic – ease out",
        cubicInOut: "Cubic – ease in/out",
        circIn: "Circular – ease in",
        circOut: "Circular – ease out",
        circInOut: "Circular – ease in/out",
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
      weatherLayer: {
        heading: "Weather",
        description: "Assign colors and icons to each condition and tune the alpha gradient.",
        alphaProfileLabel: "Alpha curve profile",
        innerWidthLabel: "Opaque segment ratio",
        opacityScaleLabel: "Opacity multiplier",
        disableLeftLabel: "Disable left fade",
      },
      temperatureLayer: {
        heading: "Temperature",
        description: "Maintain the temperature-to-color table and adjust the alpha gradient.",
        addButtonLabel: "Add stop",
        tableHeaders: {
          temperature: "Temperature (°C)",
          color: "Color",
        },
        alphaProfileLabel: "Alpha curve profile",
        innerWidthLabel: "Opaque segment ratio",
        opacityScaleLabel: "Opacity multiplier",
        disableRightLabel: "Disable right fade",
      },
      sunLayer: {
        heading: "Sun",
        description: "Configure the gradient, opacity, and icon that follow the sun's path.",
        colors: {
          night: "Night color",
          sunrise: "Sunrise color",
          day: "Day color",
          sunset: "Sunset color",
        },
        alphaProfileLabel: "Alpha curve profile",
        gradientWidthLabel: "Gradient width (%)",
        innerWidthLabel: "Opaque segment ratio",
        opacityScaleLabel: "Opacity multiplier",
        iconLabel: "Sun icon",
        iconScaleLabel: "Icon scale",
        transitionsLabel: "Color transition windows (minutes)",
        transitionsHint: "Configure when sunrise and sunset colors start blending.",
        sunriseLabel: "Sunrise",
        sunsetLabel: "Sunset",
        sunriseBeforeLabel: "Before sunrise",
        sunriseAfterLabel: "After sunrise",
        sunsetBeforeLabel: "Before sunset",
        sunsetAfterLabel: "After sunset",
      },
      gradients: {
        heading: "Layer gradients",
        description: "Fine tune how each background layer blends across the row. The shared preview bar above updates instantly.",
        edgeWidthLabel: "Edge gradient width",
        edgeWidthHint: "Base fraction (0–0.5) that controls how wide the weather and temperature gradients extend from the edges before day-length scaling.",
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
      other: {
        heading: "Other",
        description: "Miscellaneous options for the widget.",
        showDateLabel: "Show date when different",
        showDateDescription: "Append the local date whenever it differs from your current day.",
      },
      reset: {
        heading: "Reset settings",
        description: "Restore every option to the default configuration.",
        confirm: "Reset all settings to defaults? This action cannot be undone.",
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
      widgetUpdates: {
        heading: "Обновления виджета",
        description: "Выберите источник данных и настройте обновление кеша.",
        providerLabel: "Погодный сервис",
        providerHint: "Сервис, из которого берутся прогнозы.",
        providerOptions: {
          "open-meteo": "Open-Meteo",
          "openweathermap": "OpenWeatherMap",
        },
        apiKeyDescriptions: {
          "open-meteo": "Open-Meteo не требует API-ключ.",
          "openweathermap": "Для OpenWeatherMap нужен личный API-ключ из кабинета.",
        },
        apiKeyLabel: "API ключ",
        apiKeyPlaceholder: "Необязательный токен",
        intervalLabel: "Обновление кеша (мин)",
        intervalHint: "После указанного времени данные будут запрошены повторно.",
      },
      alphaProfiles: {
        sineIn: "Синус — плавное начало",
        sineOut: "Синус — плавное завершение",
        sineInOut: "Синус — плавное начало и завершение",
        quadIn: "Квадратичная — плавное начало",
        quadOut: "Квадратичная — плавное завершение",
        quadInOut: "Квадратичная — плавное начало и завершение",
        cubicIn: "Кубическая — плавное начало",
        cubicOut: "Кубическая — плавное завершение",
        cubicInOut: "Кубическая — плавное начало и завершение",
        circIn: "Круговая — плавное начало",
        circOut: "Круговая — плавное завершение",
        circInOut: "Круговая — плавное начало и завершение",
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
      weatherLayer: {
        heading: "Погода",
        description: "Настройте цвета, иконки и форму альфа-градиента для погодных состояний.",
        alphaProfileLabel: "Профиль кривой альфаканала",
        innerWidthLabel: "Доля непрозрачной части",
        opacityScaleLabel: "Множитель прозрачности",
        disableLeftLabel: "Отключить левый градиент",
      },
      temperatureLayer: {
        heading: "Температура",
        description: "Поддерживайте таблицу цветов и настраивайте альфа-градиент температурного слоя.",
        addButtonLabel: "Добавить точку",
        tableHeaders: {
          temperature: "Температура (°C)",
          color: "Цвет",
        },
        alphaProfileLabel: "Профиль кривой альфаканала",
        innerWidthLabel: "Доля непрозрачной части",
        opacityScaleLabel: "Множитель прозрачности",
        disableRightLabel: "Отключить правый градиент",
      },
      sunLayer: {
        heading: "Солнце",
        description: "Настройте цвета, непрозрачность и значок, отображающие траекторию солнца.",
        colors: {
          night: "Цвет ночи",
          sunrise: "Цвет рассвета",
          day: "Цвет дня",
          sunset: "Цвет заката",
        },
        alphaProfileLabel: "Профиль кривой альфаканала",
        gradientWidthLabel: "Ширина градиента (%)",
        innerWidthLabel: "Доля непрозрачной части",
        opacityScaleLabel: "Множитель прозрачности",
        iconLabel: "Значок солнца",
        iconScaleLabel: "Масштаб значка",
        transitionsLabel: "Окна переходов цвета (мин)",
        transitionsHint: "Настройте, за сколько до и после восхода и заката меняются цвета.",
        sunriseLabel: "Восход",
        sunsetLabel: "Закат",
        sunriseBeforeLabel: "До восхода",
        sunriseAfterLabel: "После восхода",
        sunsetBeforeLabel: "До заката",
        sunsetAfterLabel: "После заката",
      },
      gradients: {
        heading: "Градиенты слоёв",
        description: "Настройте переходы фоновых слоев. Общая панель предпросмотра выше обновляется мгновенно.",
        edgeWidthLabel: "Ширина краевого градиента",
        edgeWidthHint: "Базовая доля (0-0.5), определяющая ширину градиентов погоды и температуры у краёв строки до учёта длины дня.",
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
      other: {
        heading: "Прочее",
        description: "Дополнительные опции виджета.",
        showDateLabel: "Показывать дату, когда день отличается",
        showDateDescription: "Добавлять локальную дату, если она отличается от текущей.",
      },
     reset: {
        heading: "Сброс настроек",
        description: "Вернуть все параметры к значениям по умолчанию.",
        confirm: "Сбросить все настройки к значениям по умолчанию? Действие нельзя отменить.",
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
