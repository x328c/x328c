const COORDINATE_DECIMAL_PLACES = 7;

export const normalizeCoordinate = (value: number): number => {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) return coordinate;
  return Number(coordinate.toFixed(COORDINATE_DECIMAL_PLACES));
};

export const normalizeLocationPoint = <T extends { latitude: number; longitude: number }>(
  point: T,
): T => ({
  ...point,
  latitude: normalizeCoordinate(point.latitude),
  longitude: normalizeCoordinate(point.longitude),
});

export const hasValidLocationPoint = (point: { latitude: number; longitude: number }): boolean =>
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  point.latitude >= -90 &&
  point.latitude <= 90 &&
  point.longitude >= -180 &&
  point.longitude <= 180;
