import { AimOutlined, ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Input, InputNumber, Select, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { RoutePointInput, RoutePointType } from '../types';
import type { RegionCatalog } from '../types';
import { adminApi } from '../api/admin';

interface RouteMapEditorProps {
  value?: RoutePointInput[];
  onChange?: (value: RoutePointInput[]) => void;
}

type TencentMap = {
  on: (event: string, handler: (event: { latLng: { lat: number; lng: number } }) => void) => void;
  destroy?: () => void;
};

type TencentMapApi = {
  LatLng: new (latitude: number, longitude: number) => unknown;
  Map: new (container: HTMLElement, options: Record<string, unknown>) => TencentMap;
  MultiMarker: new (options: Record<string, unknown>) => { setGeometries: (value: unknown[]) => void; setMap?: (map: null) => void };
  MultiPolyline: new (options: Record<string, unknown>) => { setGeometries: (value: unknown[]) => void; setMap?: (map: null) => void };
};

declare global {
  interface Window { TMap?: TencentMapApi }
}

let sdkPromise: Promise<TencentMapApi> | undefined;
function loadTencentMap(key: string): Promise<TencentMapApi> {
  if (window.TMap) return Promise.resolve(window.TMap);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const callback = `__modaziMapReady${Date.now()}`;
      (window as unknown as Record<string, unknown>)[callback] = () => {
        delete (window as unknown as Record<string, unknown>)[callback];
        if (window.TMap) resolve(window.TMap); else reject(new Error('地图 SDK 加载失败'));
      };
      const script = document.createElement('script');
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}&callback=${callback}`;
      script.async = true;
      script.onerror = () => reject(new Error('地图 SDK 加载失败'));
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

const typeOptions: Array<{ value: RoutePointType; label: string }> = [
  { value: 'start', label: '起点' },
  { value: 'waypoint', label: '途经点' },
  { value: 'end', label: '终点' },
];

function normalizeOrder(points: RoutePointInput[]): RoutePointInput[] {
  return points.map((point, order) => ({ ...point, order }));
}

export function RouteMapEditor({ value = [], onChange }: RouteMapEditorProps) {
  const key = import.meta.env.VITE_TENCENT_MAP_KEY as string | undefined;
  const mapElement = useRef<HTMLDivElement>(null);
  const pointsRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const mapRef = useRef<TencentMap | undefined>(undefined);
  const markerRef = useRef<InstanceType<TencentMapApi['MultiMarker']> | undefined>(undefined);
  const polylineRef = useRef<InstanceType<TencentMapApi['MultiPolyline']> | undefined>(undefined);
  const [mapError, setMapError] = useState('');
  const [catalog, setCatalog] = useState<RegionCatalog>();

  pointsRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    void adminApi.regions().then(setCatalog).catch(() => setMapError('新疆地区目录加载失败，请刷新后重试'));
  }, []);

  const replace = (next: RoutePointInput[]) => onChange?.(normalizeOrder(next));
  const update = (index: number, patch: Partial<RoutePointInput>) => replace(value.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    replace(next);
  };

  useEffect(() => {
    if (!key || !mapElement.current) return;
    let active = true;
    void loadTencentMap(key).then((api) => {
      if (!active || !mapElement.current) return;
      const first = pointsRef.current[0];
      const center = new api.LatLng(Number(first?.latitude ?? 43.8256), Number(first?.longitude ?? 87.6168));
      const map = new api.Map(mapElement.current, { center, zoom: 10, pitch: 0, rotation: 0 });
      const marker = new api.MultiMarker({ map, styles: {}, geometries: [] });
      const polyline = new api.MultiPolyline({ map, styles: { route: { color: '#E8742A', width: 6, borderWidth: 1, borderColor: '#ffffff' } }, geometries: [] });
      map.on('click', (event) => {
        const current = pointsRef.current;
        if (current.length >= 50) return;
        const order = current.length;
        onChangeRef.current?.(normalizeOrder([...current, {
          order,
          name: order === 0 ? '起点' : `途经点 ${order}`,
          latitude: Number(event.latLng.lat.toFixed(7)),
          longitude: Number(event.latLng.lng.toFixed(7)),
          type: order === 0 ? 'start' : 'waypoint',
        }]));
      });
      mapRef.current = map; markerRef.current = marker; polylineRef.current = polyline;
      setMapError('');
    }).catch((error: unknown) => setMapError(error instanceof Error ? error.message : '地图加载失败'));
    return () => { active = false; markerRef.current?.setMap?.(null); polylineRef.current?.setMap?.(null); mapRef.current?.destroy?.(); mapRef.current = undefined; };
  }, [key]);

  useEffect(() => {
    const api = window.TMap;
    if (!api) return;
    const path = value.map((point) => new api.LatLng(Number(point.latitude), Number(point.longitude)));
    markerRef.current?.setGeometries(value.map((point, index) => ({ id: `point-${index}`, position: path[index], properties: { title: point.name } })));
    polylineRef.current?.setGeometries(path.length >= 2 ? [{ id: 'route', styleId: 'route', paths: path }] : []);
  }, [value]);

  const addCurrentLocation = () => {
    if (!navigator.geolocation) return setMapError('浏览器不支持定位');
    navigator.geolocation.getCurrentPosition((position) => {
      const current = pointsRef.current;
      const order = current.length;
      replace([...current, { order, name: order === 0 ? '当前位置起点' : `当前位置 ${order}`, latitude: Number(position.coords.latitude.toFixed(7)), longitude: Number(position.coords.longitude.toFixed(7)), type: order === 0 ? 'start' : 'waypoint' }]);
    }, () => setMapError('无法获取当前位置，请检查浏览器定位权限'));
  };

  return <div className="route-map-editor">
    {!key ? <Alert type="warning" showIcon message="尚未配置腾讯位置服务 Web JS Key" description="配置 VITE_TENCENT_MAP_KEY 后即可点击地图选点；当前仍可编辑已有坐标。" /> : null}
    {mapError ? <Alert type="error" showIcon message={mapError} /> : null}
    <div ref={mapElement} className="route-map-editor__map" />
    <Space style={{ margin: '12px 0' }}><Button icon={<AimOutlined />} onClick={addCurrentLocation}>添加当前位置</Button><Typography.Text type="secondary">点击地图依次添加点位；每个点位必须人工确认所属城市，系统不使用逆地址解析。</Typography.Text></Space>
    <div className="route-map-editor__points">
      {value.map((point, index) => <div key={`${point.id ?? 'new'}-${index}`} className="route-map-editor__point">
        <Typography.Text strong>#{index + 1}</Typography.Text>
        <Input value={point.name} maxLength={80} placeholder="点位名称" onChange={(event) => update(index, { name: event.target.value })} />
        <Select value={point.type} options={typeOptions} onChange={(type) => update(index, { type })} />
        <InputNumber value={Number(point.latitude)} min={-90} max={90} precision={7} placeholder="纬度" onChange={(latitude) => latitude != null && update(index, { latitude })} />
        <InputNumber value={Number(point.longitude)} min={-180} max={180} precision={7} placeholder="经度" onChange={(longitude) => longitude != null && update(index, { longitude })} />
        <Select status={point.city_code ? undefined : 'error'} value={point.city_code ?? undefined} showSearch optionFilterProp="label" placeholder="所属城市（必选）" options={catalog?.cities.map((city) => ({ value: city.code, label: city.name }))} onChange={(city_code) => update(index, { province_code: '650000', city_code, district_code: undefined })} />
        <Select allowClear value={point.district_code ?? undefined} showSearch optionFilterProp="label" placeholder="区县（选填）" options={catalog?.cities.find((city) => city.code === point.city_code)?.districts.map((district) => ({ value: district.code, label: district.name }))} onChange={(district_code) => update(index, { district_code })} />
        <Input value={point.address ?? point.description ?? ''} maxLength={300} placeholder="地址 / 说明" onChange={(event) => update(index, { address: event.target.value, description: event.target.value })} />
        <Button icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} />
        <Button icon={<ArrowDownOutlined />} disabled={index === value.length - 1} onClick={() => move(index, 1)} />
        <Button danger icon={<DeleteOutlined />} onClick={() => replace(value.filter((_, pointIndex) => pointIndex !== index))} />
      </div>)}
    </div>
  </div>;
}
