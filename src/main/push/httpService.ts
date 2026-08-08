import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { PushApiConfig } from '../../shared/ipc'
import { isAuthorized, parseEventBody, type PushEventBody } from './pushApi'

export interface PushServerDeps {
  getConfig(): PushApiConfig
  onPushEvent(body: PushEventBody): void
  log(level: string, ...args: unknown[]): void
}

const MAX_BODY_BYTES = 8 * 1024

export interface PushHttpServer {
  port: number
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

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(405, { ok: false, error: '仅支持 POST' })
  }
  if (req.url !== '/api/event') {
    return send(404, { ok: false, error: '未找到路径' })
  }

  const cfg = deps.getConfig()
  if (!cfg.enabled) {
    return send(503, { ok: false, error: '推送服务未启用' })
  }
  if (!isAuthorized(req.headers.authorization, cfg.token)) {
    return send(401, { ok: false, error: '认证失败' })
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

/** 启动本地 HTTP 服务（127.0.0.1，随机空闲端口） */
export function startPushHttpService(deps: PushServerDeps): Promise<PushHttpServer> {
  const server: Server = createServer((req, res) => {
    handlePushRequest(deps, req, res).catch((err) => {
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
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        port,
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
