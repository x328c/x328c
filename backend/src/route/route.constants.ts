export const ROUTE_STATUS = {
  DRAFT: 0,
  PUBLISHED: 1,
  OFFLINE: 2,
} as const;

export const ROUTE_TYPES = ['scenic', 'mountain', 'touring', 'urban'] as const;
export const ROUTE_DIFFICULTIES = ['easy', 'moderate', 'hard'] as const;
export const ROUTE_POINT_TYPES = ['start', 'waypoint', 'end'] as const;

export const ROUTE_LIMITS = {
  images: 6,
  points: 50,
  polylinePoints: 500,
  relatedRides: 20,
  relatedRideResults: 3,
} as const;

export type RouteStatus = (typeof ROUTE_STATUS)[keyof typeof ROUTE_STATUS];
export type RouteType = (typeof ROUTE_TYPES)[number];
export type RouteDifficulty = (typeof ROUTE_DIFFICULTIES)[number];
export type RoutePointType = (typeof ROUTE_POINT_TYPES)[number];
