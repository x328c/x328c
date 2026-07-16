# 疆行机车圈 - 后端API服务

基于 NestJS 10 + Prisma + MySQL + Redis 构建的摩托车骑行交友小程序后端服务。

## 技术栈

- **框架**: NestJS 10.x
- **语言**: TypeScript 5.x (严格模式)
- **ORM**: Prisma
- **数据库**: MySQL 8.0
- **缓存**: Redis 7.x
- **代码规范**: ESLint + Prettier
- **提交规范**: Conventional Commits

## 快速开始

### 环境要求

- Node.js >= 20.x
- MySQL >= 8.0
- Redis >= 7.x

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
cp .env.example .env
# 修改 .env 中的配置
```

### 数据库初始化

```bash
# 生成Prisma Client
npx prisma generate

# 执行数据库迁移
npx prisma migrate dev
```

### 启动开发服务

```bash
npm run start:dev
```

### 健康检查

访问 `http://localhost:3000/api/v1/health`

## 项目结构

```
src/
├── main.ts              # 应用入口
├── app.module.ts        # 根模块
├── app.controller.ts    # 根控制器
├── app.service.ts       # 根服务
└── modules/             # 业务模块
    ├── auth/            # 认证模块
    ├── user/            # 用户模块
    ├── ride/            # 约骑模块
    ├── activity/        # 活动模块
    ├── message/         # 消息模块
    ├── file/            # 文件模块
    ├── admin/           # 管理后台模块
    └── schedule/        # 定时任务模块
```

## 代码规范

```bash
# 代码检查
npm run lint

# 代码格式化
npm run format
```

## 模块划分

| 模块 | 职责 | 版本 |
|------|------|------|
| Auth | 微信登录、JWT鉴权、Token管理 | V1.0 |
| User | 用户资料、位置更新、用户查询 | V1.0 |
| Ride | 约骑CRUD、报名/取消、附近查询 | V1.0 |
| Activity | 活动CRUD、报名/审核 | V1.0 |
| Message | 系统通知、订阅消息推送 | V1.0 |
| File | COS上传签名、文件记录 | V1.0 |
| Admin | 后台登录、内容管理、用户管理 | V1.0 |
| Schedule | 定时任务：状态更新、数据统计 | V1.0 |

## 数据库表结构（V1.0 核心9表）

1. `users` - 用户表
2. `user_profiles` - 用户资料表
3. `rides` - 约骑表
4. `ride_participants` - 约骑参与表
5. `activities` - 活动表
6. `activity_registrations` - 活动报名表
7. `notifications` - 通知表
8. `admin_users` - 管理员表
9. `reports` - 举报表

此外，`system_settings` 用于保存平台级配置；它在项目初始化阶段创建，其余九张核心业务表将在 T104 中完成。
