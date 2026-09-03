import Taro from "@tarojs/taro";

export interface CoordinateSelection { latitude: number; longitude: number; name?: string; address?: string }

// The native picker can fail before returning coordinates for an unnamed spot.
// In that case the user explicitly reselects the point on our map; never reuse
// nearby POI coordinates or pretend that the failed native call returned a point.
export function openCoordinatePicker(initial?: CoordinateSelection): Promise<CoordinateSelection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (point?: CoordinateSelection) => {
      if (settled) return;
      settled = true;
      if (point) resolve(point);
      else reject(new Error("chooseLocation:fail cancel"));
    };
    const query = initial ? `?lat=${initial.latitude}&lng=${initial.longitude}` : "";
    void Taro.navigateTo({
      url: `/pages/map/select/index${query}`,
      events: { coordinateSelected: (point: CoordinateSelection) => finish(point), coordinateCancelled: () => finish() },
    }).catch((error) => { if (!settled) { settled = true; reject(error); } });
  });
}
