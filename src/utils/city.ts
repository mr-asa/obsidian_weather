import type { CityLocation } from "../settings";

const SIGNATURE_PRECISION = 6;

const formatCoordinate = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(SIGNATURE_PRECISION);
};

export function citySignatureFromValues(label: string, latitude: number, longitude: number): string {
  const normalizedLabel = label.trim().toLowerCase();
  const latKey = formatCoordinate(latitude);
  const lonKey = formatCoordinate(longitude);
  return `${normalizedLabel}|${latKey}|${lonKey}`;
}

export function citySignature(city: Pick<CityLocation, "label" | "latitude" | "longitude">): string {
  return citySignatureFromValues(city.label, city.latitude, city.longitude);
}

export function makeInlineCityId(label: string, latitude: number, longitude: number): string {
  return `inline:${citySignatureFromValues(label, latitude, longitude)}`;
}

export function mergeCityLists(primary: CityLocation[], secondary: CityLocation[]): CityLocation[] {
  const seen = new Set<string>();
  const result: CityLocation[] = [];
  const push = (city: CityLocation) => {
    const signature = citySignature(city);
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    result.push(city);
  };
  primary.forEach(push);
  secondary.forEach(push);
  return result;
}

