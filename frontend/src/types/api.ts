export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
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
