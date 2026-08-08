# v0.8 事件推送 API 设计文档

日期：2026-08-06

## 1. 目标与范围

v0.7 完成报告自动化。v0.8 迈出 v1.0「插件 / API / 第三方接入」的第一步——**事件推送 API**：

1. **本地 HTTP 服务**：桌宠启动监听 `127.0.0.1:<随机空闲端口>`，第三方程序（脚本/软件）可向之推送事件。
2. **Token 认证**：`Authorization: Bearer <token>`（32 位随机 hex，首次启动生成并持久化，控制中心可重置），杜绝本机任意进程乱发。
3. **事件转达**：推送成功 → 注入事件中心（状态短暂变化）+ `push:fired` 气泡（标题+正文）+ `countEvent('push')` 计入当日统计。
4. **控制中心「推送」页签**：查看服务地址/端口、token（复制/重置）、启用开关、curl 示例、测试按钮。

明确不做：完整插件体系（v1.0）、多设备同步、公网暴露、事件重放持久化。

约束沿袭 v0.5~v0.7：只绑本机回环、不联网、主进程计算、纯函数可单测、零新增依赖（Node 内置 `http`）。

## 2. 设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| HTTP 服务 | Node 内置 `http` 模块，`127.0.0.1` 随机空闲端口（listen 0 取实际端口） | 零依赖；回环不对外 |
| Token 产生/存储 | 首次启动 `randomBytes(16).toString('hex')`，持久化 `userData/pushApi.json` | 跨重启稳定；控制中心可重置 |
| 认证方式 | `Authorization: Bearer <token>` | 语义标准，第三方易实现 |
| 事件映射 | 默认 `type='notice'`（归 focus）；body 可带可选 `type`（≤32 字符） | 复用 STATE_CATEGORIES，自然驱动状态动画 |
| source 标识 | `push:<8位随机id>` 作为事件源 | 与 `addEvent` 的 source+type 去重逻辑隔离 |
| 气泡通道 | 复用 `notifyPet`，新通道 `push:fired`（{ title, body }） | 仿 autoReport:fired 已有模式 |
| 回调数据 | 校验用纯函数 `parseEventBody`，服务中间件式处理 | 可单测，服务层薄 |

## 3. 数据模型与存储

### 3.1 pushApi.json

```ts
export interface PushApiConfig {
  enabled: boolean   // 服务是否启用（默认 true，但需先启动探测端口）
  token: string      // 32 hex；首次生成
}
```

- 新模块 `src/main/push/pushApiStore.ts`：`DEFAULT_PUSH_API_CONFIG`、`loadPushApiConfig(filePath)`（缺字段补默认、容错损坏 JSON）、`savePushApiConfig(filePath, cfg)`、`validatePushApiConfig(cfg)`（token `/^[0-9a-f]{32}$/`；非法则重置为随机新 token）。仿 `autoReportStore` 模式，配单测。

## 4. HTTP 服务（src/main/push/pushApi.ts，核心纯函数）

```ts
parseEventBody(raw: unknown): { ok: true; body: PushEventBody } | { ok: false; error: string }
// PushEventBody: { title: string(≤60, 非空), message: string(≤200, 非空), type?: string(≤32) }
// 非法 → { ok:false, error }

isAuthorized(authHeader: string | undefined, token: string): boolean
// authHeader 恰为 `Bearer <token>` 才通过

generateToken(): string  // randomBytes(16).toString('hex')
```

### 4.1 服务层（src/main/push/httpService.ts）

- `startPushHttpService(deps)` → `Promise<{ port: number; close: () => void }>`：
  - `http.createServer` 监听 `127.0.0.1`，`listen(0)` 拿实际端口。
  - 路由仅 `POST /api/event`；`OPTIONS`/其他 → 405；路径不匹配 → 404；非 POST → 405。
  - `pushApi:enabled=false` → 503（服务不启动时此路径不可达）。
  - 请求处理：读 body（限制 ≤8KB，超限 413）→ `authorize`（错 401）→ `parseEventBody`（错 400）→ `deps.onPush(body)` → `200 { ok: true }`。
  - 所有分支统一 try/catch，错误仅记日志并回 JSON。
- `stopPushServer(server)`：`server.close()` 幂等。

## 5. 主进程接入（src/main/index.ts）

- 启动流程：`app.whenReady()` 后，`const { port } = await startPushServer(...)`；失败仅记日志，不影响主程序。
- 关闭流程：`app.on('will-quit')` 调用 close（幂等）。
- `onPushEvent(body)`：
  1. `countEvent('push')` 计入统计。
  2. 注入事件中心：`{ source: 'push:'+randId, type: body.type || 'notice', priority: 50, durationMs: 8000, occurredAt: now }`。
  3. `notifyPet('push:fired', { title, body: message })`。

## 6. IPC 与 UI

### 6.1 IPC（shared/ipc.ts + preload + index.d.ts）

- 类型：`PushApiInfo`（{ enabled, port, token }）、`PushApiTestResult`。
- `pushApi:get` → `{ ok: true, info }`（端口为当前实际端口，未启动为 0）。
- `pushApi:setEnabled`（boolean）→ `{ ok } | { ok:false, error }`；启→启动服务，停→close 且状态 enabled=false。
- `pushApi:resetToken` → 重置 token → `{ ok, token }`（写入文件；服务不重启，token 立即生效）。
- `pushApi:test` → 本地调用 `onPushEvent(示例)` 回返回 `{ ok }`，用于验证链路（不经过 HTTP）。
- `push:fired`（主进程→渲染层，气泡）。

### 6.2 CenterApp「推送」页（新 tab）

- 服务状态（运行中/已停）、地址行 `http://127.0.0.1:<port>`、token（带复制按钮）、启用开关、重置 Token 按钮、curl 示例（`curl -X POST http://127.0.0.1:<port>/api/event -H "Authorization: Bearer <token>" -d '{"title":"test","message":"hi"}'`）、「发送测试」按钮。

### 6.3 PetApp 气泡

- 监听 `push:fired`：显示气泡 title/body，时长 8s（仿 schedule:fired）。

## 7. 测试

| 模块 | 用例 |
| --- | --- |
| pushApi.ts | parseEventBody：合法/缺 message/超 title/length/非法 type；isTimeout 时点正确；token 生成合法；validatePushApiConfig 往返 |
| httpService.ts | 集成测试：listen 0 → 真实 POST 请求 200/400/401/413/404/405；Bearer 正确/错误/缺失 |
| 回归 | 既有 300 测试全绿；typecheck；build |

## 8. 交付与版本

- 版本 `v0.8.0806.01`。CHANGELOG 新条目；使用说明新增「推送 API」章节；API 设计文档同步；架构设计 §9 路线图新增 v0.8 行；备份 `backup/backup_20260806_v08-01/`。
- 换 IP 刷新实时验证 token 文明。

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 端口被占用 | `listen(0)` 自动选空闲端口，无冲突 |
| body 超大（攻击） | 限制 8KB，超限 413 |
| 服务未启动时第三方请求 | 明确 503/连接拒绝；控制中心显示当前端口 0=未运行 |
| 本机其他进程伪造 token | token 32 hex 随机 + 控制中心可重置 |