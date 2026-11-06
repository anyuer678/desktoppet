import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { PushApiConfig } from '../../shared/ipc'
import { isAuthorized, parseEventBody, type PushEventBody } from './pushApi'
import { createRateLimiter, type RateLimiter } from './rateLimiter'

/** GET /api/status 返回的运行时快照（供 lumen 等本地集成验证链路） */
export interface PushServiceStatus {
  app: string
  version: string
  role: string
  state: string
  uptimeMs: number
  eventsReceived: number
}

export interface PushServerDeps {
  getConfig(): PushApiConfig
  onPushEvent(body: PushEventBody): void
  getStatus(): PushServiceStatus
  log(level: string, ...args: unknown[]): void
  /** 事件投递限流（默认 20 次/秒）；状态端点不受限 */
  rateLimiter?: RateLimiter
}

/** 默认事件限流：本机脚本正常使用远低于此值 */
export const DEFAULT_PUSH_RATE_LIMIT = { limit: 20, windowMs: 1000 } as const

const MAX_BODY_BYTES = 8 * 1024

/** 推送服务仅允许本机回环监听（CI 可断言；禁止 0.0.0.0） */
export const PUSH_BIND_HOST = '127.0.0.1'

export interface PushHttpServer {
  port: number
  /** 实际绑定地址，恒为 127.0.0.1 */
  host: string
  close(): Promise<void>
}

/** 读取请求体（上限 8KB，超限 → 'too-large'）。超限立即返回，剩余 body 排空以避免 keep-alive 连接挂起 */
export function readRequestBody(
  req: IncomingMessage,
  limit = MAX_BODY_BYTES
): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let oversized = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit && !oversized) {
        oversized = true
        chunks.length = 0
        resolve('too-large')
        return
      }
      if (!oversized) chunks.push(chunk)
    })
    req.on('end', () => {
      if (!oversized) resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

/** 处理单个请求；返回 HTTP 状态码。onPushEvent 在成功时调用。 */
export async function handlePushRequest(
  deps: PushServerDeps,
  req: IncomingMessage,
  res: ServerResponse
): Promise<number> {
  const send = (status: number, body: Record<string, unknown>): number => {
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
    return status
  }

  const isEvent = req.url === '/api/event'
  const isStatus = req.url === '/api/status'
  if (!isEvent && !isStatus) {
    return send(404, { ok: false, error: '未找到路径' })
  }
  if (isEvent && req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(405, { ok: false, error: '仅支持 POST' })
  }
  if (isStatus && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return send(405, { ok: false, error: '仅支持 GET' })
  }

  const cfg = deps.getConfig()
  if (!cfg.enabled) {
    return send(503, { ok: false, error: '推送服务未启用' })
  }
  if (!isAuthorized(req.headers.authorization, cfg.token)) {
    return send(401, { ok: false, error: '认证失败' })
  }

  if (isStatus) {
    return send(200, { ok: true, ...deps.getStatus() })
  }

  if (deps.rateLimiter && !deps.rateLimiter.allow()) {
    res.setHeader('Retry-After', '1')
    return send(429, { ok: false, error: '推送过于频繁，请稍后重试' })
  }

  const raw = await readRequestBody(req)
  if (raw === 'too-large') {
    return send(413, { ok: false, error: '请求体超过 8KB 上限' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf-8'))
  } catch {
    return send(400, { ok: false, error: '请求体必须为合法 JSON' })
  }
  const result = parseEventBody(parsed)
  if (!result.ok) {
    return send(400, { ok: false, error: result.error })
  }
  deps.onPushEvent(result.body)
  return send(200, { ok: true })
}

/** 启动本地 HTTP 服务（仅 127.0.0.1，随机空闲端口） */
export function startPushHttpService(deps: PushServerDeps): Promise<PushHttpServer> {
  const limiter =
    deps.rateLimiter ??
    createRateLimiter(DEFAULT_PUSH_RATE_LIMIT.limit, DEFAULT_PUSH_RATE_LIMIT.windowMs)
  const serverDeps: PushServerDeps = { ...deps, rateLimiter: limiter }
  const server: Server = createServer((req, res) => {
    handlePushRequest(serverDeps, req, res).catch((err) => {
      deps.log('error', '[pushApi] request failed:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      res.end(JSON.stringify({ ok: false, error: '内部错误' }))
    })
  })
  server.on('error', (err) => deps.log('error', '[pushApi] server error:', err))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, PUSH_BIND_HOST, () => {
      server.removeListener('error', reject)
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const bound =
        typeof address === 'object' && address && typeof address.address === 'string'
          ? address.address
          : PUSH_BIND_HOST
      resolve({
        port,
        host: bound === '::1' ? '127.0.0.1' : bound,
        close(): Promise<void> {
          return new Promise((r) => {
            if (!server.listening) {
              r()
              return
            }
            server.close(() => r())
            server.closeAllConnections?.()
          })
        }
      })
    })
  })
}
