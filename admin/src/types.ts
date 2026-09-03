export interface ApiEnvelope<T> { code: number; message: string; data: T; timestamp: string; requestId?: string }
export interface Pagination { page: number; pageSize: number; total: number }
export interface RegionDistrict { code: string; name: string }
export interface RegionCity { code: string; name: string; districts: RegionDistrict[] }
export interface RegionCatalog { version: string; province: { code: string; name: string }; cities: RegionCity[] }
export interface AdminUser { id: string; username: string; role: number }
export interface ListResult<T> { list: T[]; pagination: Pagination }
export interface ContentItem { id: string; title: string; status: number; audit_status?: number; created_at: string; departure_time?: string; start_time?: string; join_count?: number; register_count?: number; cover_image?: string | null; creator: { id: string; nickname: string } }
export interface UserItem { id: string; nickname: string; avatar_url?: string | null; phone?: string | null; status: number; motorcycle_model?: string | null; created_at: string }
export interface ReportItem { id: string; content_type: 'ride' | 'activity' | 'user' | 'forum_post' | 'forum_reply' | 'route_comment'; content_id?: string | null; reason: number; description?: string | null; evidence_snapshot?: Record<string, unknown> | null; status: number; reporter: { id: string; nickname: string }; reported_user?: { id: string; nickname: string } | null; created_at: string }
export interface TrendItem { date: string; new_users: number; new_rides: number }
export interface OperationLogItem { id: string; admin_id: string; action: string; object_type: string; object_id: string; reason: string; request_id: string; ip_address?: string | null; before_summary?: Record<string, unknown> | null; after_summary?: Record<string, unknown> | null; created_at: string }
export type RouteStatus = 0 | 1 | 2;
export type RouteType = 'scenic' | 'mountain' | 'touring' | 'urban';
export type RouteDifficulty = 'easy' | 'moderate' | 'hard';
export type RoutePointType = 'start' | 'waypoint' | 'end';
export interface RoutePointInput { id?: string; order: number; name: string; latitude: string | number; longitude: string | number; type: RoutePointType; description?: string | null; address?: string | null; province_code?: string | null; city_code?: string | null; district_code?: string | null }
export interface RouteItem {
  id: string; title: string; summary?: string | null; cover_image?: string | null; images: string[];
  city_code?: string | null; district_code?: string | null; city_name?: string | null; type?: RouteType | null; difficulty?: RouteDifficulty | null;
  distance_km?: string | null; duration_min?: number | null; polyline: Array<{ latitude: number; longitude: number }>;
  road_condition?: string | null; suitable_motorcycles?: string | null; best_season?: string | null;
  safety_notice?: string | null; status: RouteStatus; sort_weight: number; favorite_count: number;
  published_at?: string | null; offlined_at?: string | null; offline_reason?: string | null;
  created_at: string; updated_at: string; maintainer: { id: string; username: string };
  points: RoutePointInput[]; related_ride_ids: string[];
  external_route_url?: string | null; external_route_provider?: string | null; external_url_status?: number;
  polyline_status?: number; polyline_provider?: string | null; polyline_updated_at?: string | null;
}
export interface UserRouteAdminItem {
  id: string; title: string; description?: string | null;
  start_location: string; start_lat: number; start_lng: number;
  end_location?: string | null; end_lat?: number | null; end_lng?: number | null;
  city_code?: string | null; district_code?: string | null;
  total_distance?: number | null; estimated_time?: number | null; difficulty?: number | null;
  images: string[]; visibility: 1 | 2; status: 1 | 2; view_count: number; favorite_count: number;
  external_route_url?: string | null; polyline_provider?: string | null;
  offlined_at?: string | null; offline_reason?: string | null; offlined_by?: string | null;
  created_at: string; updated_at: string;
  creator: { id: string; nickname: string; avatar_url?: string | null; status: number };
  points: RoutePointInput[];
  regions: Array<{ city_code: string; district_code: string; has_start: boolean; has_waypoint: boolean; point_count: number }>;
  linked_ride_ids: string[];
  counts: { favorites: number; comments: number; ride_links: number };
}
export interface RoutePayload {
  title: string; summary?: string; cover_image?: string; images?: string[]; city_code?: string; district_code?: string; city_name?: string;
  type?: RouteType; difficulty?: RouteDifficulty; distance_km?: number; duration_min?: number;
  polyline?: Array<{ latitude: number; longitude: number }>; road_condition?: string;
  suitable_motorcycles?: string; best_season?: string; safety_notice?: string; sort_weight?: number;
  points?: Array<Omit<RoutePointInput, 'id' | 'latitude' | 'longitude'> & { latitude: number; longitude: number }>;
  related_ride_ids?: string[];
  external_route_url?: string;
}
export type RegulationStatus = 0 | 1 | 2 | 3 | 4 | 5;
export type RevisionStatus = 0 | 1 | 2 | 3;
export interface RegulationRegion { region_code: string; region_name: string }
export interface RegulationRevision {
  id: string; version: number; summary: string; content?: string; source_snapshot?: RegulationPayload;
  change_note: string; status: RevisionStatus; creator: AdminUser; reviewer?: AdminUser | null;
  reviewed_at?: string | null; published_at?: string | null; created_at: string;
}
export interface RegulationItem {
  id: string; title: string; document_no?: string | null; document_no_empty_reason?: string | null;
  issuer: string; authority_level: string; category: string; scope: 'NATIONAL' | 'REGIONAL';
  source_url: string; status: RegulationStatus; published_at?: string | null; effective_at?: string | null;
  expired_at?: string | null; effective_note?: string | null; last_verified_at?: string | null;
  review_cycle_days: number; current_revision_id?: string | null; replacement_regulation_id?: string | null;
  offline_reason?: string | null; creator: AdminUser; tags: string[]; regions: RegulationRegion[];
  latest_revision?: RegulationRevision | null; revisions: RegulationRevision[]; created_at: string; updated_at: string;
}
export interface RegulationPayload {
  title: string; document_no?: string; document_no_empty_reason?: string; issuer: string;
  authority_level: string; category: string; scope: 'NATIONAL' | 'REGIONAL'; regions: RegulationRegion[];
  tags: string[]; source_url?: string; published_at?: string; effective_at?: string; expired_at?: string;
  effective_note?: string; last_verified_at?: string; review_cycle_days?: number;
  replacement_regulation_id?: string; summary: string; content: string; change_note: string;
}
export interface RegulationImportRow { row_number: number; payload: Partial<RegulationPayload>; errors?: string[] | null; regulation_id?: string | null }
export interface RegulationImportTask {
  id: string; duplicate: boolean; original_filename: string; file_size: number; total_rows: number;
  valid_rows: number; error_rows: number; status: number; imported_count: number;
  confirmed_at?: string | null; rows: RegulationImportRow[];
}
export interface RegulationImportListItem extends Omit<RegulationImportTask, 'duplicate' | 'file_size' | 'rows'> { created_at: string }
export interface RegulationFeedbackItem {
  id: string; regulation: { id: string; title: string; source_url: string }; user: { id: string; nickname: string };
  type: 'content_error' | 'expired' | 'link_broken'; description?: string | null; source_url?: string | null;
  status: number; created_at: string;
}
export type ForumContentType = 'post' | 'reply';
export interface ForumModerationItem {
  type: ForumContentType; id: string; title?: string; content_preview: string;
  board?: { id: string; name: string }; post?: { id: string; title: string };
  author: { id: string; nickname: string }; image_count: number; attempts: number;
  error_code?: string | null; next_retry_at?: string | null; manual_review_required: boolean; created_at: string;
}
export interface ForumQueueResult extends ListResult<ForumModerationItem> {
  counts: { pending: number; errors: number };
  metrics: { attempts: number; passed: number; rejected: number; failed: number };
}
export interface ForumContentPreview extends ForumModerationItem {
  content: string; content_format: 'plain_text'; status: number; moderation_status: number;
  moderation_reason?: string | null; offline_reason?: string | null;
  images?: Array<{ id: string; url: string; moderation_status: number; moderation_reason?: string | null }>;
  published_at?: string | null;
}
export interface ForumBoardItem { id: string; slug: string; name: string; description: string; sort_order: number; status: number }
export interface ForumRestrictionItem {
  id: string; user: { id: string; nickname: string }; reason: string; starts_at: string; ends_at: string;
  creator: { id: string; username: string }; created_at: string;
}
export interface ForumAuditItem {
  id: string; admin: AdminUser; action: string; object_type: string; object_id: string;
  before_summary?: Record<string, unknown>; after_summary?: Record<string, unknown>;
  reason: string; request_id: string; created_at: string;
}
export interface TaskFailureItem {
  id: string; task_key: string; status: number; attempts: number;
  last_error_code?: string | null; last_error_summary?: string | null;
  next_retry_at?: string | null; last_failed_at: string; resolution_note?: string | null;
}
export interface MetricsSnapshot { api: Array<{ route: string; requests: number; errors: number; error_rate: number; p95_ms: number }>; counters: Record<string, number> }
export interface FeatureFlagSettings {
  route_enabled: boolean;
  regulation_enabled: boolean;
  route_link_enabled: boolean;
  route_comment_enabled: boolean;
  route_comment_read_enabled: boolean;
  safety_guide_enabled: boolean;
  safety_agreement_enforced: boolean;
}
export interface UpdateFeatureFlagSettings extends FeatureFlagSettings { reason: string }
export interface RouteCommentAdminItem {
  id: string; content: string; images: string[]; status: string; report_count: number; reported_at?: string | null;
  rejection_reason?: string | null; offline_reason?: string | null;
  created_at: string; author: { id: string; nickname: string }; route: { id: string; title: string };
}
export interface SafetyGuideAdminItem {
  id: string; code: string; title: string; summary: string; status: number; current_revision_id?: string | null;
  revisions: Array<{
    id: string; version: string; reviewed_at?: string | null; published_at?: string | null;
    created_by: string; reviewed_by?: string | null; last_verified_at?: string | null;
    content_json: Record<string, unknown>; content_text?: string | null; source_title: string; source_url: string;
    source_issuer: string; source_published_at?: string | null; source_effective_at?: string | null;
    content_note: string;
  }>;
}
export interface SafetyGuideRevisionPayload {
  code: string; title: string; summary: string; version: string;
  content_json?: Record<string, unknown>; content_text?: string; source_title: string; source_url: string;
  source_issuer: string; source_published_at?: string; source_effective_at?: string;
  content_note: string; last_verified_at: string;
}
export interface SafetyAgreementAdminItem {
  id: string; code: string; version: string; title: string; scene: string; status: number;
  content_hash: string; effective_at?: string | null; expires_at?: string | null;
  created_by: string; reviewed_by?: string | null; reviewed_at?: string | null;
}
