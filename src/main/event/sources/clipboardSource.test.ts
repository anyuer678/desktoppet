import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClipboardSource } from './clipboardSource'
import type { PassiveClipboardConfig } from '../../../shared/ipc'
import type { SourceContext } from '../sourceHub'

function makeCtx(): SourceContext & Record<string, ReturnType<typeof vi.fn>> {
  return {
    inject: vi.fn(),
    replaceBySource: vi.fn(),
    notify: vi.fn(),
    count: vi.fn(),
    log: vi.fn()
  }
}

function baseCfg(over: Partial<PassiveClipboardConfig> = {}): PassiveClipboardConfig {
  return { enabled: true, pollMs: 300, onlyPatterns: [], ignorePatterns: [], maxLen: 120, ...over }
}

function read(text: string, hasImage = false) {
  return vi.fn(() => ({ text, hasImage }))
}

describe('createClipboardSource：内容变化触发', () => {
  it('短文本 → clipShort，notify 不带原文', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('hello'), () => baseCfg())
    source.start(ctx)
    source.poll?.(1000)
    expect(ctx.count).toHaveBeenCalledWith('clipboard')
    expect(ctx.inject).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipShort', placeholder: '' })
  })

  it('链接 → clipLink + placeholder 域名', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('https://www.example.com/x'), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipLink', placeholder: 'example.com' })
  })

  it('图片剪贴板 → clipImage', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('', true), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipImage', placeholder: '' })
  })

  it('敏感文本 → clipSensitive 且不带 placeholder', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('sk-abcdef1234567890'), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipSensitive', placeholder: '' })
  })
})

describe('createClipboardSource：指纹抑制', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 1)) })
  afterEach(() => { vi.useRealTimers() })

  it('同文本 A→B→A（8s 窗口内）只通知两次', () => {
    const seq = ['A', 'B', 'A']
    let i = 0
    const readText = vi.fn(() => ({ text: seq[i], hasImage: false }))
    const ctx = makeCtx()
    const source = createClipboardSource(readText, () => baseCfg({ pollMs: 0 }))
    source.start(ctx)
    source.poll?.(1000); i++
    source.poll?.(2000); i++
    source.poll?.(3000)
    expect(ctx.notify).toHaveBeenCalledTimes(2) // A、B 各一次；第二次 A 被抑制
  })

  it('剪贴板持续含图（8s 窗口内）只通知一次', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(vi.fn(() => ({ text: '', hasImage: true })), () => baseCfg({ pollMs: 0 }))
    source.start(ctx)
    source.poll?.(1000)
    source.poll?.(2000)
    source.poll?.(3000)
    expect(ctx.notify).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipImage', placeholder: '' })
  })

  it('窗口过期后图片再出现 → 重新通知', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(vi.fn(() => ({ text: '', hasImage: true })), () => baseCfg({ pollMs: 0 }))
    source.start(ctx)
    source.poll?.(1000)
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 10))
    source.poll?.(10_000)
    expect(ctx.notify).toHaveBeenCalledTimes(2)
  })
})