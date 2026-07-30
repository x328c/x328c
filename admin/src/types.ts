export interface ApiEnvelope<T> { code: number; message: string; data: T; timestamp: string }
export interface Pagination { page: number; pageSize: number; total: number }
export interface AdminUser { id: string; username: string; role: number }
export interface ListResult<T> { list: T[]; pagination: Pagination }
export interface ContentItem { id: string; title: string; status: number; audit_status?: number; created_at: string; departure_time?: string; start_time?: string; join_count?: number; register_count?: number; cover_image?: string | null; creator: { id: string; nickname: string } }
export interface UserItem { id: string; nickname: string; avatar_url?: string | null; phone?: string | null; status: number; motorcycle_model?: string | null; created_at: string }
export interface ReportItem { id: string; content_type: 'ride' | 'activity' | 'user'; content_id?: string | null; reason: number; description?: string | null; status: number; reporter: { id: string; nickname: string }; reported_user?: { id: string; nickname: string } | null; created_at: string }
export interface TrendItem { date: string; new_users: number; new_rides: number; new_activities: number }
