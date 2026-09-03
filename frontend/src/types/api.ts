export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
  requestId?: string;
}
export interface CurrentUser {
  id: string;
  nickname: string;
  avatar_url?: string | null;
  role: number;
  profile?: { motorcycle_model?: string | null } | null;
  profile_complete?: boolean;
  missing_profile_fields?: string[];
}
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface RideCreator {
  id: string;
  nickname: string;
  avatar_url?: string | null;
  motorcycle_model?: string | null;
  riding_years?: number | null;
  wechat_id?: string | null;
}

export interface RideSummary {
  id: string;
  title: string;
  ride_style: number;
  departure_time: string;
  meetup_address: string;
  meetup_lat?: string;
  meetup_lng?: string;
  destination?: string | null;
  max_people: number;
  join_count: number;
  is_full: boolean;
  status: number;
  city_code: string;
  district_code?: string | null;
  region_match?: "start" | "through" | null;
  destination_lat?: string | null;
  destination_lng?: string | null;
  points?: RidePointLocation[];
  route_snapshot?: RideRouteSnapshot | null;
  distance?: number | null;
  creator: RideCreator;
  participant_avatars: string[];
  route?: RouteLinkSummary | null;
}

export interface RideDetail extends RideSummary {
  description?: string | null;
  rules?: unknown;
  bike_requirement?: string | null;
  min_people?: number;
  speed_level?: number | null;
  view_count: number;
}

export interface RideLocationInput { name: string; address?: string; latitude: number; longitude: number; province_code?: string; city_code?: string; district_code?: string }
export interface RidePointLocation extends RideLocationInput { id: string; order: number; type: "waypoint" | "destination"; source: string }

export interface RideRouteSnapshot {
  source_type: "official" | "user";
  source_id: string;
  title: string;
  points?: RidePointLocation[];
  polyline?: Array<{ latitude: number; longitude: number }>;
  distance_km?: number | null;
  duration_min?: number | null;
  external_route_url?: string | null;
  customized?: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface RideListResponse {
  list: RideSummary[];
  pagination: Pagination;
}

export interface RideParticipant {
  user_id: string;
  nickname: string;
  avatar_url?: string | null;
  motorcycle_model?: string | null;
  joined_at: string;
  is_creator: boolean;
}

export interface RideParticipantsResponse {
  list: RideParticipant[];
  pagination: Pagination;
}

export interface CreateRidePayload {
  title: string;
  ride_style: number;
  departure_time: string;
  meetup_address: string;
  meetup_lat: number;
  meetup_lng: number;
  destination?: string;
  destination_point?: RideLocationInput;
  waypoints?: RideLocationInput[];
  min_people: number;
  max_people: number;
  speed_level: number;
  bike_requirement?: string;
  description?: string;
  rules?: Record<string, unknown>;
  city_code: string;
  district_code?: string;
  route_id?: string;
  user_route_id?: string;
  route_link_source?: "route_detail" | "create_form";
  route_customized?: boolean;
  agreement?: AgreementProof;
}
export interface RideRelaunchTemplate extends Omit<CreateRidePayload, "departure_time" | "agreement"> { source_ride_id: string; departure_time: null }

export interface AgreementProof { id: string; version: string; content_hash: string }
export interface SafetyAgreement extends AgreementProof {
  code: string; title: string; content: string; scene: "ride_create" | "ride_join";
  effective_at?: string | null; last_legal_reviewed_at?: string | null;
}
export interface RouteLinkSummary {
  id: string; title: string; city_code?: string | null; city_name?: string | null;
  source_type: "official" | "user"; difficulty?: string | number | null; distance_km?: string | null; start_name?: string | null;
  end_name?: string | null; available: boolean;
}
export interface NotificationItem { id: string; type: number; title: string; content: string; related_type?: "ride" | "activity" | null; related_id?: string | null; is_read: boolean; unread_dot: boolean; created_at: string; }
export interface NotificationListResponse { list: NotificationItem[]; pagination: Pagination; }
export interface UserProfile extends CurrentUser { phone?: string | null; gender?: number; profile?: CurrentUser["profile"] & { riding_years?: number | null; riding_styles?: string[] | null; bio?: string | null; wechat_id?: string | null; location_visible?: number; wechat_visible?: number } | null; }
export interface PublicUserProfile { id: string; nickname: string; avatar_url?: string | null; motorcycle_model?: string | null; riding_years?: number | null; riding_styles?: string[] | null; bio?: string | null; wechat_id?: string | null; city?: string | null; }

export type RouteType = "scenic" | "mountain" | "touring" | "urban";
export type RouteDifficulty = "easy" | "moderate" | "hard";
export interface RouteSummary {
  id: string; title: string; summary?: string | null; cover_image?: string | null;
  city_code?: string | null; city_name?: string | null; type?: RouteType | null;
  difficulty?: RouteDifficulty | null; distance_km?: string | null; duration_min?: number | null;
  favorite_count: number; is_favorited: boolean; updated_at: string;
  region_match?: "start" | "through" | null;
}
export interface RoutePoint {
  id: string; order: number; name: string; latitude: string; longitude: string;
  type: "start" | "waypoint" | "end"; description?: string | null; address?: string | null;
  province_code?: string | null; city_code?: string | null; district_code?: string | null;
}
export interface RouteDetail extends RouteSummary {
  images: string[]; polyline: Array<{ latitude: number; longitude: number }>;
  polyline_status?: number; polyline_provider?: string | null; polyline_updated_at?: string | null;
  district_code?: string | null; external_route_url?: string | null;
  external_route_provider?: string | null; external_url_status?: number;
  road_condition?: string | null; suitable_motorcycles?: string | null; best_season?: string | null;
  safety_notice?: string | null; published_at?: string | null; points: RoutePoint[];
}
export interface RouteListResponse { items: RouteSummary[]; nextCursor: string | null; hasMore: boolean }
export interface RelatedRideListResponse { items: RideSummary[] }
export interface RouteComment {
  id: string; content: string; images: string[]; status: "PUBLISHED" | "DELETED";
  rejection_reason?: string | null; offline_reason?: string | null; published_at?: string | null;
  created_at: string; author: { id: string; nickname: string; avatar_url?: string | null };
}
export interface CursorResult<T> { items: T[]; nextCursor: string | null; hasMore: boolean }
export interface UserRouteWaypoint { name: string; latitude: number; longitude: number; address?: string; province_code?: string; city_code?: string; district_code?: string }
export interface UserRoute {
  id: string; user_id: string; title: string; description?: string | null;
  start_location: string; start_lat: number; start_lng: number; end_location?: string | null;
  end_lat?: number | null; end_lng?: number | null; waypoints: UserRouteWaypoint[];
  end_point?: UserRouteWaypoint | null;
  city_code?: string | null; district_code?: string | null;
  polyline: Array<{ latitude: number; longitude: number }>;
  polyline_status?: number; polyline_provider?: string | null;
  external_route_url?: string | null; external_route_provider?: string | null; external_url_status?: number;
  total_distance?: number | null; estimated_time?: number | null; difficulty?: number | null;
  images: string[]; visibility: 1 | 2; view_count: number; favorite_count: number;
  created_at: string; updated_at: string; is_owner: boolean; is_favorited: boolean;
  region_match?: "start" | "through" | null;
  creator: { id: string; nickname: string; avatar_url?: string | null };
}
export interface UserRoutePayload {
  title: string; description?: string; start_location: string; start_lat: number; start_lng: number;
  end_location?: string; end_lat?: number; end_lng?: number; waypoints?: UserRouteWaypoint[];
  end_point?: UserRouteWaypoint;
  city_code?: string; district_code?: string; external_route_url?: string;
  total_distance?: number; estimated_time?: number; difficulty?: number; images?: string[]; visibility: 1 | 2;
}
export interface ShareMetadata { title: string; path: string; imageUrl: string }
export interface RideShareSummary {
  departure_time: string;
  meetup_address: string;
  destination: string | null;
  join_count: number;
  max_people: number;
  status: number;
}
export interface SafetyGuide {
  code: string; title: string; summary: string; version: string; content: Record<string, unknown>;
  contentHash: string; publishedAt?: string | null; lastVerifiedAt?: string | null; stale: boolean;
  source: { title: string; url: string; issuer: string; publishedAt?: string | null; effectiveAt?: string | null };
  notice: string;
}
export interface UserSettings {
  profile_visibility: "public" | "participants" | "private"; contact_visible: boolean;
  ride_notifications: boolean; activity_notifications: boolean; system_notifications: boolean;
}
export type RegulationStatus = 2 | 3 | 4;
export interface RegulationSummary {
  id: string; title: string; document_no?: string | null; document_no_empty_reason?: string | null;
  issuer: string; authority_level: string; category: string; scope: "NATIONAL" | "REGIONAL";
  regions: Array<{ code: string; name: string }>; tags: string[]; status: RegulationStatus;
  source_url: string; published_at?: string | null; effective_at?: string | null; expired_at?: string | null;
  effective_note?: string | null; last_verified_at?: string | null; review_due_at?: string | null;
  review_overdue: boolean; reviewer?: { id: string; username: string } | null; summary?: string | null;
  replacement?: { id: string; title: string; status: number } | null; updated_at: string;
  matched_fields?: string[]; relevance_score?: number;
}
export interface RegulationDetail extends RegulationSummary {
  content: string; source_snapshot: Record<string, unknown>;
  revision: { id: string; version: number; change_note: string };
  revision_history: Array<{ id: string; version: number; change_note: string; published_at?: string | null }>;
  disclaimer: string;
}
export interface RegulationListResponse {
  items: RegulationSummary[]; nextCursor: string | null; hasMore: boolean; suggestions: string[]; disclaimer: string;
}
