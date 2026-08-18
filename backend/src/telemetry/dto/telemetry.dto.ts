import { IsIn, IsObject, IsString, Length } from 'class-validator';

export const TELEMETRY_EVENT_NAMES = [
  'route_module_exposure',
  'route_list_result',
  'route_filter',
  'route_detail_view',
  'route_favorite',
  'route_related_rides_click',
  'route_create_companion_click',
  'regulation_module_exposure',
  'regulation_search',
  'regulation_result_click',
  'regulation_source_open',
  'regulation_feedback',
  'safety_guide_accident_open',
  'safety_guide_source_click',
] as const;

export class TrackTelemetryEventDto {
  @IsString() @Length(16, 64) event_id!: string;
  @IsIn(TELEMETRY_EVENT_NAMES) name!: (typeof TELEMETRY_EVENT_NAMES)[number];
  @IsObject() properties!: Record<string, string | number | boolean>;
  @IsString() @Length(20, 40) occurred_at!: string;
}
