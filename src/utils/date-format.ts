export interface DateComponents {
  year: number;
  month: number;
  day: number;
}

export interface MonthNameSet {
  short: string[];
  long: string[];
}

const DEFAULT_MONTH_NAMES: MonthNameSet = {
  short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  long: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const TOKEN_REGEX = /yyyy|MMMM|MMM|MM|yy|dd|d|M/g;

export function extractDateComponents(date: Date): DateComponents {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function createDateKey(components: DateComponents): string {
  return [
    components.year.toString().padStart(4, "0"),
    components.month.toString().padStart(2, "0"),
    components.day.toString().padStart(2, "0"),
  ].join("-");
}

export function normalizeDateFormat(format: string | null | undefined, fallback: string): string {
  const trimmed = typeof format === "string" ? format.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

export function formatDateComponents(
  components: DateComponents,
  format: string,
  fallback = "dd.MM",
  monthNames?: MonthNameSet,
): string {
  const pattern = normalizeDateFormat(format, fallback);
  const monthIndex = Math.max(0, Math.min(11, components.month - 1));
  const resolvedMonths: MonthNameSet = {
    short:
      monthNames?.short?.length === 12
        ? monthNames.short
        : DEFAULT_MONTH_NAMES.short,
    long:
      monthNames?.long?.length === 12
        ? monthNames.long
        : DEFAULT_MONTH_NAMES.long,
  };
  const replacements: Record<string, string> = {
    yyyy: components.year.toString().padStart(4, "0"),
    yy: components.year.toString().slice(-2).padStart(2, "0"),
    dd: components.day.toString().padStart(2, "0"),
    d: components.day.toString(),
    MM: components.month.toString().padStart(2, "0"),
    M: components.month.toString(),
    MMM: resolvedMonths.short[monthIndex] ?? components.month.toString(),
    MMMM: resolvedMonths.long[monthIndex] ?? components.month.toString(),
  };

  return pattern.replace(TOKEN_REGEX, (token) => replacements[token] ?? token);
}
