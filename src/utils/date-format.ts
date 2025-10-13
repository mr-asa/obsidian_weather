export interface DateComponents {
  year: number;
  month: number;
  day: number;
}

const TOKEN_REGEX = /yyyy|yy|dd|MM|d|M/g;

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
): string {
  const pattern = normalizeDateFormat(format, fallback);
  const replacements: Record<string, string> = {
    yyyy: components.year.toString().padStart(4, "0"),
    yy: components.year.toString().slice(-2).padStart(2, "0"),
    dd: components.day.toString().padStart(2, "0"),
    d: components.day.toString(),
    MM: components.month.toString().padStart(2, "0"),
    M: components.month.toString(),
  };

  return pattern.replace(TOKEN_REGEX, (token) => replacements[token] ?? token);
}
