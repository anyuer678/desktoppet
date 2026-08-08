import { request } from 'http'
import { afterEach, describe, expect, it } from 'vitest'
import type { PushEventBody } from './pushApi'
import { startPushHttpService, type PushServerDeps } from './httpService'

interface TestDeps extends PushServerDeps {
  received: PushEventBody[]
}

function makeDeps(config: { enabled: boolean; token: string }): TestDeps {
  const received: PushEventBody[] = []
  const deps: TestDeps = {
    received,
    getConfig: () => ({ ...config }),
    onPushEvent: (body) => received.push(body),
    log: () => {}
  }
  return deps
}

/** 向 127.0.0.1:port 发起一次请求 */
function send(
  port: number,
  path: string,
  method: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (opts.token !== undefined) headers.Authorization = `Bearer ${opts.token}`
    let body: Buffer | undefined
    if (opts.body !== undefined && typeof opts.body === 'string') {
      body = Buffer.from(opts.body as string, 'utf-8')
      headers['Content-Length'] = String(body.length)
    } else if (opts.body !== undefined) {
      body = Buffer.from(JSON.stringify(opts.body), 'utf-8')
      headers['Content-Length'] = String(body.length)
    }
    const req = request(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8') })
        )
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

describe('httpService', () => {
  let server: { port: number; close(): Promise<void> } | null = null
  let deps: TestDeps
  const token = 'ab'.repeat(16)

  async function start(config: Partial<{ enabled: boolean; token: string }> = {}): Promise<number> {
    deps = makeDeps({ enabled: true, token, ...config })
    server = await startPushHttpService(deps)
    return server.port
  }

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('POST 合法事件 + 正确 Bearer → 200，触发 onPushEvent', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'POST', {
      token,
      body: { title: 'hi', message: 'hello' }
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.text)).toEqual({ ok: true })
    expect(deps.received).toEqual([{ title: 'hi', message: 'hello' }])
  })

  it('缺 header → 401', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'POST', { body: { title: 't', message: 'm' } })
    expect(res.status).toBe(401)
  })

  it('错误 token → 401', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'POST', {
      token: 'cd'.repeat(16),
      body: { title: 't', message: 'm' }
    })
    expect(res.status).toBe(401)
  })

  it('body 非 JSON → 400', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'POST', { token, body: '{broken' })
    expect(res.status).toBe(400)
  })

  it('缺 title → 400 且不调用 onPushEvent', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'POST', { token, body: { message: 'm' } })
    expect(res.status).toBe(400)
    expect(deps.received).toEqual([])
  })

  it('路径不对 → 404', async () => {
    const port = await start()
    const res = await send(port, '/nope', 'POST', { token, body: { title: 't', message: 'm' } })
    expect(res.status).toBe(404)
  })

  it('方法非 POST → 405', async () => {
    const port = await start()
    const res = await send(port, '/api/event', 'GET')
    expect(res.status).toBe(405)
  })

  it('body >8KB → 413', async () => {
    const port = await start()
    const big = JSON.stringify({ title: 't', message: 'm'.repeat(9 * 1024) })
    const res = await send(port, '/api/event', 'POST', { token, body: big })
    expect(res.status).toBe(413)
  })

  it('config enabled=false → 503', async () => {
    const port = await start({ enabled: false })
    const res = await send(port, '/api/event', 'POST', { token, body: { title: 't', message: 'm' } })
    expect(res.status).toBe(503)
    expect(deps.received).toEqual([])
  })

  it('close 幂等，关闭后端口不可达', async () => {
    const port = await start()
    await server?.close()
    await server?.close()
    await expect(send(port, '/api/event', 'POST', { token, body: { title: 't', message: 'm' } })).rejects.toThrow()
  })
})