import { describe, expect, it, vi } from 'vitest'
import { createClipboardSource } from './sources/clipboardSource'
import { isSensitive } from './sourceClassifier'
import type { PassiveClipboardConfig, PushApiFired } from '../../shared/ipc'
import type { SourceContext } from './sourceHub'

/** Automated assertion: sensitive clipboard plaintext never enters push:fired IPC payloads */

const SECRETS = [
  'sk-Abcdef1234567890',
  'AKIAIOSFODNN7EXAMPLE',
  'ghp_' + 'a'.repeat(36),
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----',
  'password=SuperSecret!2026',
  'token = xyz-should-not-leak',
  '验证码：654321 五分钟内有效',
  '4111111111111111'
]

function makeCtx() {
  return {
    inject: vi.fn(),
    replaceBySource: vi.fn(),
    notify: vi.fn(),
    count: vi.fn(),
    log: vi.fn()
  } satisfies SourceContext
}

function baseCfg(over: Partial<PassiveClipboardConfig> = {}): PassiveClipboardConfig {
  return {
    enabled: true,
    pollMs: 0,
    onlyPatterns: [],
    ignorePatterns: [],
    maxLen: 200,
    ...over
  }
}

function serializeIpcArgs(ctx: ReturnType<typeof makeCtx>): string {
  const parts: string[] = []
  for (const call of ctx.notify.mock.calls) parts.push(JSON.stringify(call))
  for (const call of ctx.inject.mock.calls) parts.push(JSON.stringify(call))
  return parts.join('\n')
}

describe('Sensitive clipboard: zero-leak IPC payloads', () => {
  for (const secret of SECRETS) {
    it(`isSensitive matches and payload excludes plaintext: ${secret.slice(0, 18)}...`, () => {
      expect(isSensitive(secret)).toBe(true)
      const ctx = makeCtx()
      const source = createClipboardSource(
        vi.fn(() => ({ text: secret, hasImage: false })),
        () => baseCfg()
      )
      source.start(ctx)
      source.poll?.(Date.now())

      expect(ctx.notify).toHaveBeenCalledTimes(1)
      const [channel, payload] = ctx.notify.mock.calls[0] as [string, PushApiFired]
      expect(channel).toBe('push:fired')
      expect(payload).toEqual({ kind: 'passive', reaction: 'clipSensitive', placeholder: '' })
      expect(payload.placeholder).toBe('')

      const dump = serializeIpcArgs(ctx)
      expect(dump).not.toContain(secret)
      if (secret.length > 8) {
        expect(dump).not.toContain(secret.slice(0, 12))
      }
    })
  }

  it('Event-center inject writes metadata only (no clipboard body)', () => {
    const secret = 'sk-' + 'Zz9'.repeat(10)
    expect(isSensitive(secret)).toBe(true)
    const ctx = makeCtx()
    const source = createClipboardSource(
      vi.fn(() => ({ text: secret, hasImage: false })),
      () => baseCfg()
    )
    source.start(ctx)
    source.poll?.(Date.now())

    expect(ctx.inject).toHaveBeenCalledTimes(1)
    const [event] = ctx.inject.mock.calls[0] as [{ source: string; type: string }]
    expect(event).toMatchObject({ source: 'clipboard', type: 'clipboard' })
    expect(JSON.stringify(event)).not.toContain(secret)
  })

  it('Non-sensitive short text does not echo full body into placeholder', () => {
    const text = 'hello portfolio world'
    const ctx = makeCtx()
    const source = createClipboardSource(
      vi.fn(() => ({ text, hasImage: false })),
      () => baseCfg()
    )
    source.start(ctx)
    source.poll?.(Date.now())
    const [, payload] = ctx.notify.mock.calls[0] as [string, PushApiFired]
    expect(payload.reaction).toBe('clipShort')
    expect(payload.placeholder).toBe('')
    expect(serializeIpcArgs(ctx)).not.toContain(text)
  })
})
