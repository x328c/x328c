# V2.3.0 API 与数据模型变更清单

> 2026-09-02 增量决策：新客户端点位城市改由 `wx.choosePoi.city` 映射并由用户确认；删除腾讯地图 Key 逆地址解析配置，不用于兼容、抽样校验或历史回填。接口、错误码和灰度策略详见《[`wx.choosePoi` 城市归属与筛选改造方案](./wx.choosePoi城市归属与筛选改造方案V2.3.0.md)》。现有字段及地区覆盖表继续复用。

## 1. 接口变更

| 方法 | 路径 | 变更 |
| --- | --- | --- |
| GET | `/api/v1/regions?province_code=650000` | 返回新疆城市、区县和数据版本 |
| GET | `/api/v1/routes` | 增加 `city_code`、`district_code`、`region_scope=any|start|through`，默认 any |
| GET | `/api/v1/routes/:id` | 返回 external link 元数据和 polyline 状态 |
| GET | `/api/v1/routes/:id/share` | 返回官方路线分享标题、路径和图片 |
| GET | `/api/v1/user-routes/public` | 增加地区过滤参数 |
| POST/PUT | `/api/v1/user-routes[/:id]` | 增加标准点位、外链；折线由服务端生成 |
| GET | `/api/v1/user-routes/:id/share` | 公开路线分享元数据；私密返回 403 |
| POST | `/api/v1/routes/validate-external-link` | 校验并识别第三方路线链接，可选接口 |
| POST/PATCH | `/api/v1/admin/routes[/:id]` | 支持地图点位和外链，不再要求人工 polyline JSON |
| POST | `/api/v1/admin/routes/plan` | 管理端预览道路规划，不落库 |
| GET | `/api/v1/admin/user-routes` | 分页查询用户路线，支持关键词、状态、可见性和城市筛选 |
| GET | `/api/v1/admin/user-routes/:id` | 查看用户路线、发布者、点位、地区覆盖和业务计数详情 |
| POST | `/api/v1/admin/user-routes/:id/offline` | 管理员填写原因并下架正常用户路线 |
| POST | `/api/v1/admin/user-routes/:id/restore` | 超级管理员恢复由管理员下架的用户路线 |
| GET | `/api/v1/rides` | 集合点/途经点城市过滤，返回 `region_match=start|through`，保持距离排序参数 |
| POST | `/api/v1/rides` | 增加 `waypoints`、`destination_point`，关联路线由服务端导入 |
| GET | `/api/v1/rides/:id` | 返回行程点、路线快照和分享摘要 |
| GET | `/api/v1/rides/:id/share` | 返回同行分享元数据 |
| GET | `/api/v1/rides/:id/relaunch-template` | 返回再次发起模板；限原发起人/有效参与者 |
| GET | `/api/v1/users/profile` | 增加 `profile_complete`、`missing_profile_fields` |

## 2. 请求结构

### 2.1 标准点位

```json
{
  "order": 0,
  "type": "start",
  "name": "集合点名称",
  "address": "完整地址",
  "latitude": 43.8256,
  "longitude": 87.6168,
  "province_code": "650000",
  "city_code": "650100",
  "district_code": "650102"
}
```

行政区划由 `wx.choosePoi.city` 映射或用户从受控目录确认；后端校验代码合法性和城市—区县父子关系，不调用逆地址服务复核。

### 2.2 用户路线创建

```json
{
  "title": "南山休闲路线",
  "description": "周末休闲骑",
  "points": ["标准点位数组，1至22项"],
  "external_route_url": "https://受支持平台/...",
  "visibility": 2,
  "difficulty": 3,
  "images": []
}
```

### 2.3 同行创建扩展

```json
{
  "title": "周末南山骑行",
  "meetup_address": "集合点",
  "meetup_lat": 43.8256,
  "meetup_lng": 87.6168,
  "waypoints": ["0至20个标准点位"],
  "destination_point": "可选标准点位",
  "route_id": "官方路线ID，和user_route_id二选一",
  "user_route_id": "用户路线ID",
  "city_code": "650100",
  "district_code": "650102"
}
```

服务端必须校验 `city_code` 存在于支持目录，且 `district_code` 属于该城市。服务端不再调用逆地址解析验证坐标归属；无法取得城市时客户端必须人工确认。

## 3. Prisma 模型建议

### 3.1 既有模型字段

`Route` 增加：

- `district_code String? @db.VarChar(20)`
- `external_route_url String? @db.VarChar(1000)`
- `external_route_provider String? @db.VarChar(32)`
- `external_url_status Int @default(0) @db.TinyInt`
- `polyline_status Int @default(0) @db.TinyInt`
- `polyline_provider String? @db.VarChar(32)`
- `polyline_updated_at DateTime?`

`RoutePoint` 增加 address、province_code、city_code、district_code 及相应索引。

`UserRoute` 增加：

- `city_code`、`district_code`
- `polyline Json?` 及状态/provider/更新时间
- 第三方链接三个字段
- `route_data_version Int @default(2)`
- `offlined_at DateTime?`、`offline_reason String?`、`offlined_by BigInt?`，用于区分管理员下架和用户自行删除
- 组合索引 `(status, offlined_at, id)`，支持后台治理列表和恢复条件查询

`Ride` 增加：

- `district_code String?`
- `destination_lat/lng Decimal?`
- `destination_city_code/district_code String?`
- `route_snapshot Json?`
- `route_snapshot_version Int?`

`UserProfile.wechat_id` 增加标准化唯一索引。迁移前必须输出重复值报告，不能直接创建唯一约束。

### 3.2 新表

`UserRoutePoint`：`user_route_id, order, type, name, address, lat, lng, province_code, city_code, district_code`；唯一键 `(user_route_id, order)`。

`RouteRegion`：`route_id, city_code, district_code, point_count`；唯一键 `(route_id, city_code, district_code)`，查询索引 `(city_code, district_code, route_id)`。

`UserRouteRegion`：与 RouteRegion 对称。

`RidePoint`：`ride_id, order, type=waypoint|destination, name, address, lat, lng, city_code, district_code, source`；唯一键 `(ride_id, order)`。

## 4. 响应兼容

- 保留现有 `start_location/start_lat/.../waypoints` 和 `Ride.destination` 一个版本周期。
- 新客户端优先读取 `points`；旧字段由服务端序列化层从新点位派生。
- BigInt 一律转字符串，Decimal 坐标沿用字符串或统一 number，单个响应中不得混用。
- 列表不返回 polyline 和完整快照。

## 5. 错误码建议

| 业务码 | 场景 |
| --- | --- |
| 53100 | 路线点位顺序或类型不合法 |
| 53101 | 地图道路规划失败，可降级保存 |
| 53102 | 第三方路线链接不受支持或不安全 |
| 53103 | 私密/下线路线不可分享 |
| 53104 | 路线行政区划无法识别 |
| 53110 | 用户路线不存在 |
| 53111 | 用户路线当前状态不允许下架或恢复 |
| 53112 | 用户路线不是管理员下架，禁止后台恢复 |
| 52120 | 同行途经点数量或顺序不合法 |
| 52121 | 关联路线不可见或不存在 |
| 52122 | 再次发起无权限 |
| 52123 | 历史同行不可生成模板 |
| 51110 | 个人资料未完善，返回缺失字段 |
| 51111 | 微信号已被使用 |
| 51112 | 微信号格式不合法 |
| 51120 | 地区代码不在当前支持范围 |

## 6. 数据迁移门禁

1. 迁移前备份并统计 Route、RoutePoint、UserRoute、Ride、UserProfile。
2. 微信号先 trim、大小写归一并生成重复报告；由产品确认处理后再加唯一索引。
3. 用户路线点位回填数量必须与旧起点、waypoints、终点可解析数量一致。
4. 地区回填失败的数据进入报告，不能猜测到默认城市。
5. 新表和 nullable 字段先上线，回填脚本可重复执行且有断点。
6. `offlined_at/offline_reason/offlined_by` 初始均为空，不得将历史 `status=2` 路线推断为管理员下架；历史用户删除路线保持不可恢复。
