import { IsIn, IsObject, IsString, Length } from 'class-validator';

export const TELEMETRY_EVENT_NAMES = [
  'route_module_exposure',
  'route_list_result',
  'route_filter',
  'route_detail_view',
  'route_favorite',
  'route_related_rides_click',
  'regulation_module_exposure',
  'regulation_search',
  'regulation_result_click',
  'regulation_source_open',
  'regulation_feedback',
  'forum_module_exposure',
  'forum_post_view',
  'forum_post_submit',
  'forum_reply_submit',
  'forum_like',
  'forum_report',
] as const;

export class TrackTelemetryEventDto {
  @IsString() @Length(16, 64) event_id!: string;
  @IsIn(TELEMETRY_EVENT_NAMES) name!: (typeof TELEMETRY_EVENT_NAMES)[number];
  @IsObject() properties!: Record<string, string | number | boolean>;
  @IsString() @Length(20, 40) occurred_at!: string;
}
