import Taro from "@tarojs/taro";
import { request } from "./request";

type RouteEvent =
  | "route_module_exposure"
  | "route_list_result"
  | "route_filter"
  | "route_detail_view"
  | "route_favorite"
  | "route_related_rides_click"
  | "route_create_companion_click";

export function trackRouteEvent(event: RouteEvent, data: Record<string, string | number | boolean> = {}): void {
  trackEvent(event, data);
}

type EventName = RouteEvent | RegulationEvent;

function trackEvent(event: EventName, data: Record<string, string | number | boolean> = {}): void {
  try {
    Taro.reportAnalytics(event, data);
  } catch {
    // 埋点不可阻断路线浏览或同行转化主流程。
  }
  const eventId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  void request({
    method: "POST",
    url: "/telemetry/events",
    data: { event_id: eventId, name: event, properties: data, occurred_at: new Date().toISOString() },
  }).catch(() => undefined);
}

type RegulationEvent = "regulation_module_exposure" | "regulation_search" | "regulation_result_click" | "regulation_source_open" | "regulation_feedback" | "safety_guide_accident_open" | "safety_guide_source_click";
export function trackRegulationEvent(event: RegulationEvent, data: Record<string, string | number | boolean> = {}): void {
  trackEvent(event, data);
}
