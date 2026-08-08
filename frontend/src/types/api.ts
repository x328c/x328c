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
  distance?: number | null;
  creator: RideCreator;
  participant_avatars: string[];
}

export interface RideDetail extends RideSummary {
  description?: string | null;
  rules?: unknown;
  bike_requirement?: string | null;
  min_people?: number;
  speed_level?: number | null;
  view_count: number;
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
  min_people: number;
  max_people: number;
  speed_level: number;
  bike_requirement?: string;
  description?: string;
  rules?: Record<string, unknown>;
  city_code: string;
}

export interface ActivitySummary {
  id: string; title: string; cover_image?: string | null; activity_type: number;
  start_time: string; end_time: string; meetup_address: string; max_people: number;
  register_count: number; is_full: boolean; fee_type: number; fee_amount?: string | null;
  status: number; city_code: string; creator: RideCreator; registration_avatars: string[];
}
export interface ActivityDetail extends ActivitySummary {
  route_description?: string | null; requirements?: string | null; content?: string | null;
  contact_name: string; contact_wechat: string; need_approval: boolean;
  registration_status: number | null;
}
export interface ActivityListResponse { list: ActivitySummary[]; pagination: Pagination; }
export interface CreateActivityPayload {
  title: string; cover_image?: string; activity_type: number; start_time: string; end_time: string;
  meetup_address: string; meetup_lat: number | undefined; meetup_lng: number | undefined; max_people: number; fee_type: number;
  fee_amount?: number; requirements?: string; route_description?: string; content: string;
  contact_name: string; contact_wechat: string; need_approval: boolean; city_code: string;
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
}
export interface RoutePoint {
  id: string; order: number; name: string; latitude: string; longitude: string;
  type: "start" | "waypoint" | "end"; description?: string | null;
}
export interface RouteDetail extends RouteSummary {
  images: string[]; polyline: Array<{ latitude: number; longitude: number }>;
  road_condition?: string | null; suitable_motorcycles?: string | null; best_season?: string | null;
  safety_notice?: string | null; published_at?: string | null; points: RoutePoint[];
}
export interface RouteListResponse { items: RouteSummary[]; nextCursor: string | null; hasMore: boolean }
export interface RelatedRideListResponse { items: RideSummary[] }
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

export interface ForumBoard { id: string; slug: string; name: string; description: string; sort_order: number }
export interface ForumCapability {
  can_write: boolean; reason: "login_required" | "user_disabled" | "muted" | "read_only" | "not_invited" | null;
  publish_mode: "invite_only" | "gray" | "all";
  restriction?: { ends_at: string; reason: string };
}
export interface ForumAuthor { id: string; nickname: string; avatar_url?: string | null }
export interface ForumImage { id: string; url: string; order: number }
export interface ForumPostSummary {
  id: string; title: string; excerpt?: string; content?: string; content_format?: "plain_text";
  status: number; moderation_status: 0 | 1 | 2; moderation_reason?: string | null; moderation_error: boolean;
  board: Pick<ForumBoard, "id" | "slug" | "name">; author: ForumAuthor; images: ForumImage[];
  liked: boolean; like_count: number; reply_count: number; published_at?: string | null; created_at: string;
  offline_reason?: string | null;
}
export interface ForumPostDetail extends ForumPostSummary { content: string }
export interface ForumReply {
  id: string; content: string; content_format: "plain_text"; status: number; moderation_status: 0 | 1 | 2;
  moderation_reason?: string | null; moderation_error: boolean; author: ForumAuthor;
  published_at?: string | null; created_at: string; offline_reason?: string | null;
}
export interface ForumPostListResponse { items: ForumPostSummary[]; nextCursor: string | null; hasMore: boolean }
export interface ForumReplyListResponse { items: ForumReply[]; nextCursor: string | null; hasMore: boolean }
export interface ForumSubmitState { status: number; moderation_status: 0 | 1 | 2; moderation_reason?: string | null; moderation_last_error_code?: string | null; manual_review_required: boolean }
