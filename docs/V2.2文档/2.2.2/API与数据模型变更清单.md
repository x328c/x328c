# V2.2 API 与数据模型变更清单

## 1. 新增及扩展接口

| 方法 | 路径 | 角色 | 请求/响应要点 |
| --- | --- | --- | --- |
| GET | `/api/v1/safety-guides/safe-riding-initiative` | 公开 | 返回当前已发布倡议；无内容返回 404/业务码，不影响法规列表 |
| DELETE | `/api/v1/admin/regulations/:id` | role=9 | Body `{ reason }`；永久删除单条并写审计 |
| POST | `/api/v1/admin/regulations/batch/delete` | role=9 | Body `{ ids: string[1..100], reason }`；整批事务 |

安全倡议后台继续复用：

- `GET /api/v1/admin/safety-guides`
- `POST /api/v1/admin/safety-guides/revisions`
- `POST /api/v1/admin/safety-guides/revisions/:id/review`
- `POST /api/v1/admin/safety-guides/revisions/:id/publish`
- `POST /api/v1/admin/safety-guides/:id/offline`

## 2. 下线接口

第一阶段统一返回 HTTP 410 和业务码 `57001 FEATURE_RETIRED`，响应消息为“该功能已于 V2.2 下线，请升级到最新版本”。稳定一个发布周期后移除控制器，使其返回 404。

- `/api/v1/activities/**`
- `/api/v1/admin/activities/**`
- `/api/v1/forum/**`
- `/api/v1/admin/forum/**`

## 3. DTO

`BatchDeleteRegulationsDto`：

- `ids`：数组、1 至 100 项、每项为正整数字符串、去重；
- `reason`：2 至 500 字，服务端 `trim` 后校验；
- 不接受客户端传入标题、状态或删除数量。

`CreateSafetyGuideRevisionDto` 继续使用现有字段；当 `code=safe_riding_initiative` 时，额外验证 `content_json.sections` 为非空数组，标题和段落均为纯文本，`sources` 至少一项且 URL 使用 HTTPS。

## 4. 数据模型策略

- 不新增倡议表，复用 `SafetyGuideArticle` / `SafetyGuideRevision`。
- 不在本次迁移中删除 Activity、Forum Prisma 模型对应的生产表；代码可暂时保留归档模型，也可用独立只读脚本访问。
- 法规删除不新增 `deleted_at` 软删除语义，因为需求明确要求直接删除；操作日志只保存摘要与 ID，不保存正文副本。
- `RegulationImportRow.regulation_id` 删除前置空，保留导入任务审计；法规反馈随法规删除。

## 5. 错误码建议

| 业务码 | 场景 |
| --- | --- |
| 57001 | 活动或论坛功能已下线 |
| 54120 | 法规删除目标不存在 |
| 54121 | 法规删除原因不合规 |
| 54122 | 批量删除 ID 重复或超过 100 条 |
| 54123 | 法规删除事务失败 |
| 56008 | 安全骑行倡议暂无已发布版本 |
