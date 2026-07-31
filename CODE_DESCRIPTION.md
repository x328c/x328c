# 摩搭子助手 — 项目代码说明

## 一、项目概览

「摩搭子助手」是一个面向摩托车骑行爱好者的社交平台，用户可以通过微信小程序发布约骑、组织活动、浏览骑行路线、参与论坛讨论、查询法规政策，管理员通过 Web 后台进行内容审核和用户管理。

> **品牌色**: 活力橙 `#FF6A00` / 深邃黑 `#1F1F1F` / 纯净白 `#FFFFFF`

| 模块 | 技术栈 | 入口 |
|------|--------|------|
| **后端 API** | NestJS + Prisma + MySQL + Redis | `backend/` |
| **小程序前端** | Taro 4 + React 18 + Zustand + NutUI | `frontend/` |
| **管理后台** | React 19 + Vite + Ant Design + AntV | `admin/` |

基础设施使用 Docker Compose 编排 MySQL 8.0 和 Redis 7。

---

## 二、后端（`backend/`）

### 2.1 技术栈

- **框架**: NestJS 10 (Express 平台)
- **包名**: `jiangxing-backend` → 计划更名为 `modazi-backend`
- **描述**: 摩搭子助手 - 后端API服务
- **ORM**: Prisma 5 + MySQL
- **缓存**: Redis (ioredis) — 用于令牌黑名单、地理位置索引、浏览计数等
- **认证**: Passport + JWT（双令牌：Access Token 2h / Refresh Token 7d）
- **内容安全**: 腾讯云 CMS（内容安全审核）
- **文件存储**: 腾讯云 COS（对象存储）
- **定时任务**: @nestjs/schedule（约骑状态自动流转）

### 2.2 目录结构

```
backend/src/
├── main.ts                    # 启动入口：全局管道、过滤器、拦截器、CORS
├── app.module.ts              # 根模块，导入所有业务模块
├── auth/                      # 微信登录认证
│   ├── auth.controller.ts     # POST /auth/wx-login, /auth/refresh, /auth/logout
│   ├── auth.service.ts        # 微信 code2session + JWT 签发/刷新/拉黑
│   ├── strategies/jwt.strategy.ts
│   └── guards/
├── user/                      # 用户模块
│   ├── user.controller.ts     # 获取/更新个人信息、更新位置
│   └── user.service.ts
├── ride/                      # 约骑模块（核心业务）
│   ├── ride.controller.ts     # CRUD + 列表/附近/我的/报名/移除
│   ├── ride.service.ts        # Haversine 距离计算 + Redis GEO
│   └── dto/                   # 请求参数校验
├── activity/                  # 活动模块
│   ├── activity.controller.ts # CRUD + 报名/审批/通知/我的
│   ├── activity.service.ts
│   └── dto/
├── message/                   # 消息通知
│   ├── message.controller.ts  # 消息列表/已读/未读数
│   ├── message.service.ts
│   └── subscription-message.service.ts  # 微信订阅消息推送
├── file/                      # 文件上传（COS）
│   ├── file.controller.ts     # 获取上传签名 + 回调
│   └── file.service.ts
├── report/                    # 举报模块
│   ├── report.controller.ts   # 用户举报
│   ├── admin-report.controller.ts  # 管理员处理举报
│   └── report.service.ts
├── admin/                     # 管理员模块
│   ├── admin.controller.ts    # 登录/仪表盘/用户管理/内容管理
│   ├── admin.service.ts       # 统计数据、趋势分析、封禁用户
│   └── strategies/
├── schedule/                  # 定时任务
│   ├── ride-status.scheduler.ts  # 每15分钟检查并流转约骑状态
│   └── schedule.service.ts
└── common/                    # 公共模块
    ├── prisma/                # Prisma 数据库服务（全局单例）
    ├── redis/                 # Redis 服务封装
    ├── content-security/      # 腾讯云内容审核
    ├── filters/               # 全局异常过滤器
    ├── interceptors/          # 统一响应格式 { code, message, data }
    ├── middleware/             # 请求日志中间件
    └── decorators/            # @Roles 装饰器
```

### 2.3 API 路由前缀

所有接口统一前缀：`/api/v1`

统一响应格式：
```json
{ "code": 0, "message": "success", "data": { ... } }
```

### 2.4 数据模型（Prisma Schema）

共 10 个数据表：

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `users` | 用户 | openid, nickname, phone, status, role |
| `user_profiles` | 用户资料 | 车型、骑龄、位置(经纬度+偏移种子)、微信号可见性 |
| `rides` | 约骑 | 标题、骑行风格、出发时间、集合点、人数、速度、状态 |
| `ride_participants` | 约骑参与者 | ride_id + user_id 唯一约束，is_creator 标记发起人 |
| `activities` | 活动 | 类型、费用、开始/结束时间、是否需要审批 |
| `activity_registrations` | 活动报名 | 真实姓名、电话、紧急联系人、审批状态 |
| `notifications` | 通知 | 类型、标题、内容、已读状态、推送状态 |
| `admin_users` | 管理员 | 用户名、密码哈希、角色 |
| `reports` | 举报 | 举报类型(用户/约骑/活动)、原因、处理状态 |
| `system_settings` | 系统设置 | key-value 键值对 |
| `file_records` | 文件记录 | COS 上传文件信息 |

### 2.5 核心业务逻辑

**认证流程**：
1. 小程序调用 `wx.login` 获取 code
2. 后端用 code 换取 openid/unionid
3. `user.upsert` 自动创建或恢复用户
4. 签发双 JWT（access + refresh）
5. 登出时将 JWT 加入 Redis 黑名单

**约骑状态机**：
```
1 (招募中) → 2 (即将出发) → 3 (进行中) → 4 (已结束)
                                            ↘ 5 (管理员下架)
```
状态流转由 `RideStatusScheduler` 定时任务每 15 分钟自动执行：
- 出发前 2 小时 → 状态 2，发送通知
- 出发时间到达 → 状态 3
- 出发后 8 小时 → 状态 4，从 Redis GEO 移除

**附近搜索**：
- 创建约骑时，将 `(经纬度, ride_id)` 存入 Redis GEO 集合 `geo:rides:{city_code}`
- 查询附近时使用 `GEORADIUS` 命令，结果按距离排序
- 列表接口中使用 Haversine 公式计算距离

**内容安全**：
- 创建/更新约骑和活动时，文本内容通过腾讯云 CMS 审核
- 审核不通过会抛出异常阻止发布

---

## 三、小程序前端（`frontend/`）

### 3.1 技术栈

- **框架**: Taro 4.2（跨端框架，编译为微信小程序）
- **UI 库**: NutUI React Taro
- **状态管理**: Zustand 5
- **HTTP 客户端**: Axios（通过 Taro.addInterceptor 注入 Token）
- **日期处理**: Day.js
- **文件上传**: cos-wx-sdk-v5（腾讯云 COS 小程序 SDK）

### 3.2 目录结构

```
frontend/src/
├── app.ts                     # 入口：检查登录状态、未读消息
├── app.config.ts              # 路由配置 + TabBar
├── pages/                     # 页面
│   ├── auth/                  # 登录授权页
│   ├── index/                 # 首页（约骑列表 + 附近）
│   ├── rides/                 # 约骑相关
│   │   ├── create/            # 创建约骑
│   │   ├── detail/            # 约骑详情
│   │   └── participants/      # 参与者列表
│   ├── activities/            # 活动相关
│   │   ├── index/             # 活动列表
│   │   ├── detail/            # 活动详情
│   │   └── create/            # 创建活动
│   ├── profile/               # 个人主页 + 编辑
│   ├── my/rides/              # 我的约骑
│   ├── my/activities/         # 我的活动
│   ├── messages/              # 消息通知
│   ├── settings/              # 设置
│   └── users/profile/         # 他人主页
├── components/                # 公共组件
│   ├── RideCard/              # 约骑卡片
│   ├── ActivityCard/          # 活动卡片
│   ├── StatusTag/             # 状态标签
│   ├── RideFilterSheet/       # 筛选面板
│   ├── ConfirmDialog/         # 确认弹窗
│   ├── Empty/                 # 空状态
│   └── Skeleton/              # 骨架屏
├── services/                  # API 请求层
│   ├── request.ts             # 封装 Axios，注入 Token，自动刷新
│   ├── auth.ts                # 登录接口
│   ├── rides.ts               # 约骑接口
│   ├── activities.ts          # 活动接口
│   ├── users.ts               # 用户接口
│   ├── notifications.ts       # 通知接口
│   └── system.ts              # 系统接口
├── stores/                    # Zustand 状态管理
│   ├── user-store.ts          # 用户会话
│   ├── ride-store.ts          # 约骑列表
│   ├── ride-interaction-store.ts  # 约骑互动（报名/取消）
│   ├── activity-store.ts      # 活动列表
│   ├── notification-store.ts  # 未读消息数
│   └── app-store.ts           # 应用全局状态
├── types/api.ts               # TypeScript 类型定义
├── constants/                 # 常量
└── utils/                     # 工具函数
    ├── format.ts              # 日期/距离格式化
    └── upload.ts              # 图片上传
```

### 3.3 页面路由（TabBar）

```
Tab: ⌂ 首页    → pages/index/index        (约骑列表 + 附近)
Tab: 🗺 路线    → pages/routes/index       (路线推荐)    【V2.0 新增】
Tab: 💬 论坛    → pages/forum/index        (论坛板块)    【V2.0 新增】
Tab: ✉ 消息    → pages/messages/index     (通知列表)
Tab: ● 我的    → pages/profile/index      (个人中心)
```

> 法规助手入口放在"我的"页面中或首页快捷入口。

### 3.4 品牌色彩体系 (V2.0)

| 色彩角色 | 色值 | 用途 |
|---------|------|------|
| 主色 (Primary) | `#FF6A00` 橙色 | 按钮、选中态、高亮元素 |
| 深色 (Dark) | `#1F1F1F` 深黑 | 导航栏、标题文字 |
| 浅色 (Light) | `#FFFFFF` 白色 | 页面背景、卡片 |
| TabBar 选中色 | `#FF6A00` | 底部导航选中态 |
| TabBar 未选中 | `#8C8C8C` | 底部导航默认态 |

### 3.4 核心特性

- **Token 自动刷新**：`request.ts` 拦截器中检测 401，自动调用 `refresh` 接口更换 Access Token
- **地理位置偏移**：用户位置使用 `location_offset_seed` 种子做随机偏移，保护隐私
- **距离计算**：客户端和服务端双重支持 Haversine 距离计算
- **骨架屏**：列表加载时使用 Skeleton 组件提升体验
- **筛选面板**：约骑列表支持按骑行风格、时间范围、距离半径筛选

---

## 四、管理后台（`admin/`）

### 4.1 技术栈

- **框架**: React 19 + Vite 8
- **UI 库**: Ant Design 6
- **路由**: React Router 7
- **图表**: @ant-design/plots (AntV)
- **状态管理**: Zustand 5
- **代码检查**: Oxlint

### 4.2 目录结构

```
admin/src/
├── main.tsx                   # 入口
├── App.tsx                    # 路由配置 + 登录守卫
├── layouts/admin-layout.tsx   # 侧边栏 + 顶栏布局
├── pages/
│   ├── login.tsx              # 管理员登录
│   ├── dashboard.tsx          # 数据仪表盘（统计 + 趋势图）
│   ├── content-management.tsx # 内容管理（约骑 + 活动）
│   ├── users.tsx              # 用户管理（列表 + 详情 + 封禁）
│   └── reports.tsx            # 举报管理（处理举报）
├── api/
│   ├── client.ts              # Axios 封装（注入 Admin Token）
│   └── admin.ts               # 管理后台 API
├── stores/auth-store.ts       # 管理员认证状态
└── types.ts                   # 类型定义
```

### 4.3 管理后台功能

| 页面 | 功能 |
|------|------|
| **仪表盘** | 总用户数、DAU、今日新增、约骑/活动总数；7/30 天趋势折线图 |
| **约骑管理** | 列表查询、关键字搜索、状态下架、删除 |
| **活动管理** | 列表查询、关键字搜索、状态下架、删除 |
| **用户管理** | 列表查询、用户详情（含统计）、封禁/解封 |
| **举报管理** | 举报列表、处理举报（忽略/下架内容/封禁用户） |

---

## 五、基础设施（`docker-compose.yml`）

```
MySQL 8.0    → jiangxing-mysql:3306  (数据库: jiangxing_db)
Redis 7      → jiangxing-redis:6379
```

数据持久化使用 Docker volumes：
- `mysql_data` — MySQL 数据
- `redis_data` — Redis 数据

---

## 六、技术亮点

1. **双 JWT 令牌机制**：Access Token 短时效（2h）保护接口安全，Refresh Token 长时效（7d）减少登录频率，Redis 黑名单防止令牌泄露后滥用。

2. **Redis GEO 地理搜索**：使用 Redis GEO 数据结构实现附近约骑高效检索，避免数据库全表扫描。

3. **内容安全审核**：集成腾讯云 CMS，在内容发布时实时审核文本，从源头拦截违规内容。

4. **定时状态流转**：使用 @nestjs/schedule 每 15 分钟自动更新约骑状态，配合通知推送提醒参与者。

5. **位置隐私保护**：用户真实经纬度经过随机偏移种子处理后再展示，平衡功能体验与隐私保护。

6. **统一响应格式**：后端通过全局拦截器统一 `{ code, message, data }` 格式，前端通过 Axios 拦截器统一处理 401 和错误提示。

7. **跨端小程序**：使用 Taro 4 框架，一套 React 代码可编译为微信小程序，具备扩展为 H5、支付宝小程序等能力。

---

## 七、V2.0 规划（当前版本）

### 7.1 新增功能模块

| 模块 | 说明 | 优先级 |
|------|------|--------|
| 🗺 **路线推荐** | 热门骑行路线发现与分享，支持轨迹展示、设施标注、UGC 提交 | P0 |
| 💬 **论坛** | 摩托车话题讨论社区，板块分类、发帖回帖、楼中楼、点赞收藏 | P0 |
| 📋 **法规助手** | 摩托车法规智能查询，分类浏览、关键词搜索、城市政策 | P0 |

### 7.2 品牌升级

- **名称**: 疆行机车圈 → **摩搭子助手**
- **Slogan**: 摩友搭子，骑行不孤单
- **品牌色**: 活力橙 `#FF6A00` / 深邃黑 `#1F1F1F` / 纯净白 `#FFFFFF`

### 7.3 V1.0 细节完善

- 性能优化：游标分页、图片懒加载、接口缓存、骨架屏完善
- 体验优化：空状态引导、错误提示、分享海报、深色模式适配
- 功能完善：用户等级体系、操作日志、数据导出、消息推送优化

### 7.4 新增后端模块

```
backend/src/
├── route/          # 路线推荐模块
├── forum/          # 论坛模块
├── regulation/     # 法规助手模块
├── common/
│   ├── sensitive-word/   # 敏感词过滤
│   ├── html-sanitizer/   # XSS 过滤
│   └── excel/            # Excel 导入导出
└── schedule/
    ├── route-hot.scheduler.ts    # 路线热度更新
    ├── forum-hot.scheduler.ts    # 论坛热度更新
    └── regulation-tags.scheduler.ts  # 热门标签更新
```

### 7.5 新增数据表（V2.0）

| 表名 | 说明 |
|------|------|
| `routes` | 路线主表 |
| `route_points` | 路线点（起点/途经/终点/设施） |
| `route_favorites` | 路线收藏 |
| `route_reviews` | 路线评价 |
| `forum_boards` | 论坛板块 |
| `forum_posts` | 论坛帖子 |
| `forum_replies` | 论坛回复 |
| `forum_likes` | 论坛点赞（帖子/回复通用） |
| `forum_favorites` | 论坛收藏 |
| `user_follows` | 用户关注 |
| `regulations` | 法规主表 |
| `regulation_favorites` | 法规收藏 |
| `regulation_feedbacks` | 法规反馈 |

### 7.6 开发文档

详见 `docs/` 目录下的 V2.0 文档：
- [产品需求文档 PRD V2.0](docs/产品需求文档PRD_V2.0.md)
- [技术方案设计 V2.0](docs/技术方案设计V2.0.md)
- [市场需求文档 MRD V2.0](docs/市场需求文档MRD_V2.0.md)
- [项目计划表 V2.0](docs/项目计划表V2.0.md)
- [UI/UX 设计思路 V2.0](docs/UI_UX设计思路V2.0.md)
