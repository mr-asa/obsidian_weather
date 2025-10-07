import { clamp } from "./math";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const normalizeOffsetString = (value: string): string => {
  return value.replace(/[−–—]/g, "-");
};

const parseOffsetFromString = (value: string): number | null => {
  const normalized = normalizeOffsetString(value);
  const offsetMatch = /(UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?/.exec(normalized);
  if (offsetMatch) {
    const sign = offsetMatch[2] === "-" ? -1 : 1;
    const hours = Number.parseInt(offsetMatch[3], 10);
    const minutes = offsetMatch[4] ? Number.parseInt(offsetMatch[4], 10) : 0;
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return sign * (hours * 60 + minutes);
    }
  }
  if (normalized.includes("UTC") || normalized.includes("GMT")) {
    return 0;
  }
  return null;
};

export function timezoneOffsetFromIdentifier(date: Date, timezone: string): number | null {
  const attempt = (option: Intl.DateTimeFormatOptions["timeZoneName"]): number | null => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: option,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const tzName = parts.find((part) => part.type === "timeZoneName")?.value;
      if (!tzName) {
        return null;
      }
      return parseOffsetFromString(tzName);
    } catch {
      return null;
    }
  };

  return attempt("shortOffset")
    ?? attempt("longOffset")
    ?? attempt("short")
    ?? attempt("long");
}

const clampLatitude = (latitude: number): number => {
  return clamp(latitude, -90, 90);
};

const dayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / MS_PER_DAY);
};

export function computeSolarAltitude(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetMinutes: number,
): number | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timezoneOffsetMinutes)) {
    return null;
  }

  const latRad = toRadians(clampLatitude(latitude));
  const day = dayOfYear(date);

  const minutesLocal = date.getHours() * 60
    + date.getMinutes()
    + date.getSeconds() / 60
    + date.getMilliseconds() / MS_PER_MINUTE;

  const fractionalYear = (2 * Math.PI / 365) * (day - 1 + (minutesLocal / 60 - 12) / 24);

  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(fractionalYear)
    - 0.032077 * Math.sin(fractionalYear)
    - 0.014615 * Math.cos(2 * fractionalYear)
    - 0.040849 * Math.sin(2 * fractionalYear)
  );

  const solarDeclination = 0.006918
    - 0.399912 * Math.cos(fractionalYear)
    + 0.070257 * Math.sin(fractionalYear)
    - 0.006758 * Math.cos(2 * fractionalYear)
    + 0.000907 * Math.sin(2 * fractionalYear)
    - 0.002697 * Math.cos(3 * fractionalYear)
    + 0.00148 * Math.sin(3 * fractionalYear);

  const timeOffset = equationOfTime + 4 * longitude - timezoneOffsetMinutes;

  let trueSolarTime = minutesLocal + timeOffset;
  while (trueSolarTime < 0) {
    trueSolarTime += 1_440;
  }
  while (trueSolarTime >= 1_440) {
    trueSolarTime -= 1_440;
  }

  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) {
    hourAngle += 360;
  }

  const hourAngleRad = toRadians(hourAngle);
  const altitudeRad = Math.asin(
    Math.sin(latRad) * Math.sin(solarDeclination)
    + Math.cos(latRad) * Math.cos(solarDeclination) * Math.cos(hourAngleRad),
  );

  if (!Number.isFinite(altitudeRad)) {
    return null;
  }

  return toDegrees(altitudeRad);
}
