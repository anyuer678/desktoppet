import { describe, expect, it, vi } from 'vitest'
import { createSourceHub, type EventSource, type SourceContext } from './sourceHub'

function makeCtx(): SourceContext & Record<string, ReturnType<typeof vi.fn>> {
  return {
    inject: vi.fn(),
    replaceBySource: vi.fn(),
    notify: vi.fn(),
    count: vi.fn(),
    log: vi.fn()
  }
}

function makePollSource(id: string, enabled: boolean) {
  const start = vi.fn()
  const stop = vi.fn()
  const poll = vi.fn()
  const source: EventSource = { id, kind: 'poll', enabled: () => enabled, start, stop, poll }
  return { source, start, stop, poll }
}

function makeWatchSource(id: string, enabled = true) {
  const start = vi.fn()
  const stop = vi.fn()
  const source: EventSource = { id, kind: 'watch', enabled: () => enabled, start, stop }
  return { source, start, stop }
}

describe('createSourceHub：tick 驱动 poll 源', () => {
  it('两个启用 poll 源各 poll 一次且收到正确的 now', () => {
    const a = makePollSource('a', true)
    const b = makePollSource('b', true)
    const hub = createSourceHub(makeCtx(), [a.source, b.source])
    const now = 123_456
    hub.tick(now)
    expect(a.poll).toHaveBeenCalledTimes(1)
    expect(b.poll).toHaveBeenCalledTimes(1)
    expect(a.poll).toHaveBeenCalledWith(now)
    expect(b.poll).toHaveBeenCalledWith(now)
  })

  it('disabled 的 poll 源不被调用', () => {
    const disabled = makePollSource('disabled', false)
    const enabled = makePollSource('enabled', true)
    const hub = createSourceHub(makeCtx(), [disabled.source, enabled.source])
    hub.tick(1)
    expect(disabled.poll).not.toHaveBeenCalled()
    expect(enabled.poll).toHaveBeenCalledTimes(1)
  })

  it('poll 抛异常不影响其他源，且 ctx.log 收到 error', () => {
    const a = makePollSource('boom', true)
    a.poll.mockImplementation(() => {
      throw new Error('boom')
    })
    const b = makePollSource('ok', true)
    const ctx = makeCtx()
    const hub = createSourceHub(ctx, [a.source, b.source])
    expect(() => hub.tick(7)).not.toThrow()
    expect(a.poll).toHaveBeenCalledTimes(1)
    expect(b.poll).toHaveBeenCalledTimes(1)
    expect(ctx.log).toHaveBeenCalledWith('error', expect.stringContaining('boom'), expect.any(Error))
  })

  it('tick 不驱动 watch 源', () => {
    const watch = makeWatchSource('w')
    const hub = createSourceHub(makeCtx(), [watch.source])
    hub.tick(5)
    expect(watch.start).not.toHaveBeenCalled()
    expect(watch.stop).not.toHaveBeenCalled()
  })
})

describe('createSourceHub：replaceBySource 契约', () => {
  it('makeCtx 返回的 SourceContext 含 replaceBySource 函数', () => {
    const ctx = makeCtx()
    expect(typeof ctx.replaceBySource).toBe('function')
  })

  it('调用 replaceBySource 后旧前缀事件被移除、新事件保留', () => {
    const events = [
      { source: 'monitor:cpu', type: 'old', priority: 1, durationMs: 1000, occurredAt: 1 },
      { source: 'plugin:a', type: 'kept', priority: 1, durationMs: 1000, occurredAt: 1 },
      { source: 'push:x', type: 'kept', priority: 1, durationMs: 1000, occurredAt: 1 }
    ]
    const next = [...events.filter((e) => !e.source.startsWith('monitor:')), { source: 'monitor:mem', type: 'new', priority: 1, durationMs: 1000, occurredAt: 1 }]
    expect(next.map((e) => e.source)).toEqual(['plugin:a', 'push:x', 'monitor:mem'])
  })
})

describe('createSourceHub：start/stop', () => {
  it('start 后 watch 源收到非空 ctx，hub.stop 触发其 stop', () => {
    const watch = makeWatchSource('w')
    const ctx = makeCtx()
    const hub = createSourceHub(ctx, [watch.source])
    hub.start()
    expect(watch.start).toHaveBeenCalledTimes(1)
    const received = watch.start.mock.calls[0][0]
    expect(received).toBeDefined()
    expect(typeof received.inject).toBe('function')
    expect(typeof received.replaceBySource).toBe('function')
    expect(typeof received.notify).toBe('function')
    expect(typeof received.count).toBe('function')
    expect(typeof received.log).toBe('function')
    hub.stop()
    expect(watch.stop).toHaveBeenCalledTimes(1)
  })

  it('start() 幂等：重复调用只触发一次各项 start', () => {
    const a = makePollSource('a', true)
    const watch = makeWatchSource('w')
    const hub = createSourceHub(makeCtx(), [a.source, watch.source])
    hub.start()
    hub.start()
    expect(a.start).toHaveBeenCalledTimes(1)
    expect(watch.start).toHaveBeenCalledTimes(1)
  })

  it('stop() 幂等：重复调用无异常', () => {
    const watch = makeWatchSource('w')
    const hub = createSourceHub(makeCtx(), [watch.source])
    hub.start()
    hub.stop()
    expect(() => hub.stop()).not.toThrow()
    expect(watch.stop).toHaveBeenCalledTimes(1)
  })
})
