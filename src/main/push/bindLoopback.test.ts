import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { PUSH_BIND_HOST, startPushHttpService } from './httpService'
import type { PushServerDeps } from './httpService'

function makeDeps(): PushServerDeps {
  return {
    getConfig: () => ({ enabled: true, token: 'ab'.repeat(16) }),
    onPushEvent: () => {},
    log: () => {}
  }
}

describe('Push API 仅绑定本机回环', () => {
  let server: { port: number; host: string; close(): Promise<void> } | null = null

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('PUSH_BIND_HOST 常量为 127.0.0.1（禁止 0.0.0.0）', () => {
    expect(PUSH_BIND_HOST).toBe('127.0.0.1')
  })

  it('httpService 源码契约：listen 使用 PUSH_BIND_HOST', () => {
    const src = readFileSync(join(__dirname, 'httpService.ts'), 'utf-8')
    expect(src).toContain('server.listen(0, PUSH_BIND_HOST')
    expect(src).not.toMatch(/listen\(\s*0\s*,\s*'0\.0\.0\.0'/)
    expect(src).not.toMatch(/listen\(\s*0\s*,\s*"0\.0\.0\.0"/)
  })

  it('startPushHttpService 返回 host=127.0.0.1 且端口可连', async () => {
    server = await startPushHttpService(makeDeps())
    expect(server.host).toBe('127.0.0.1')
    expect(server.port).toBeGreaterThan(0)
  })
})
