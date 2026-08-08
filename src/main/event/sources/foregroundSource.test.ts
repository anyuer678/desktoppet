import { describe, expect, it, vi } from 'vitest'
import type { PassiveForegroundConfig } from '../../../shared/ipc'
import type { SourceContext } from '../sourceHub'
import {
  FOREGROUND_PS_SCRIPT,
  createForegroundSource,
  foregroundMapping,
  getForegroundApp
} from './foregroundSource'

function makeCtx(): SourceContext & Record<string, ReturnType<typeof vi.fn>> {
  return {
    inject: vi.fn(),
    replaceBySource: vi.fn(),
    notify: vi.fn(),
    count: vi.fn(),
    log: vi.fn()
  }
}

function baseCfg(over: Partial<PassiveForegroundConfig> = {}): PassiveForegroundConfig {
  return { enabled: true, pollMs: 1000, mappings: [], ...over }
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

describe('foregroundMapping', () => {
  const mappings: { process: string; state: 'focus' | 'ignore' }[] = [
    { process: 'code.exe', state: 'focus' },
    { process: 'notepad.exe', state: 'ignore' }
  ]

  it('精确命中返回对应映射', () => {
    expect(foregroundMapping({ process: 'code.exe', title: 'x' }, mappings)).toEqual({
      process: 'code.exe',
      state: 'focus'
    })
  })

  it('大小写不敏感命中', () => {
    expect(foregroundMapping({ process: 'Code.EXE', title: 'x' }, mappings)).toEqual({
      process: 'code.exe',
      state: 'focus'
    })
  })

  it('无匹配返回 null', () => {
    expect(foregroundMapping({ process: 'unknown.exe', title: 'x' }, mappings)).toBeNull()
  })

  it('ignore 映射原样返回', () => {
    expect(foregroundMapping({ process: 'notepad.exe', title: 'x' }, mappings)).toEqual({
      process: 'notepad.exe',
      state: 'ignore'
    })
  })
})

describe('getForegroundApp', () => {
  it('解析进程名与标题', async () => {
    const runner = vi.fn(async () => 'code.exe|编辑器')
    await expect(getForegroundApp(runner)).resolves.toEqual({
      process: 'code.exe',
      title: '编辑器'
    })
    expect(runner).toHaveBeenCalledWith(FOREGROUND_PS_SCRIPT)
  })

  it('PowerShell 无前台窗口输出 | → 空进程空标题', async () => {
    const runner = vi.fn(async () => '|')
    await expect(getForegroundApp(runner)).resolves.toEqual({ process: '', title: '' })
  })

  it('runner 抛异常 → null', async () => {
    const runner = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(getForegroundApp(runner)).resolves.toBeNull()
  })

  it('runner 返回空串 → null', async () => {
    const runner = vi.fn(async () => '')
    await expect(getForegroundApp(runner)).resolves.toBeNull()
  })
})

describe('createForegroundSource', () => {
  it('间隔未到 → runner 不被调用', async () => {
    const ctx = makeCtx()
    const runner = vi.fn(async () => 'a.exe|t1')
    const src = createForegroundSource(() => baseCfg({ pollMs: 1000 }), runner)
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    src.poll?.(1500)
    await flush()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('进程从 a.exe 变 b.exe 且映射 focus → count + inject working', async () => {
    const ctx = makeCtx()
    const runner = vi
      .fn()
      .mockResolvedValueOnce('a.exe|t1')
      .mockResolvedValueOnce('b.exe|t2')
    const pollMs = 1000
    const src = createForegroundSource(
      () => baseCfg({ pollMs, mappings: [{ process: 'b.exe', state: 'focus' }] }),
      runner
    )
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    src.poll?.(2000)
    await flush()
    expect(ctx.count).toHaveBeenCalledTimes(2)
    expect(ctx.count).toHaveBeenCalledWith('foreground')
    expect(ctx.inject).toHaveBeenCalledTimes(1)
    expect(ctx.inject).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'foreground',
        type: 'working',
        priority: 4,
        durationMs: pollMs * 2
      })
    )
  })

  it('切换聚焦 → notify foreground', async () => {
    const ctx = makeCtx()
    const runner = vi
      .fn()
      .mockResolvedValueOnce('a.exe|t1')
      .mockResolvedValueOnce('b.exe|t2')
    const src = createForegroundSource(
      () => baseCfg({ pollMs: 1000, mappings: [{ process: 'b.exe', state: 'focus' }] }),
      runner
    )
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    src.poll?.(2000)
    await flush()
    expect(ctx.notify).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', {
      kind: 'passive',
      reaction: 'foreground',
      placeholder: 'b.exe'
    })
  })

  it('无映射 → 仅 count 不 inject', async () => {
    const ctx = makeCtx()
    const runner = vi
      .fn()
      .mockResolvedValueOnce('a.exe|t1')
      .mockResolvedValueOnce('b.exe|t2')
    const src = createForegroundSource(() => baseCfg({ mappings: [] }), runner)
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    src.poll?.(2000)
    await flush()
    expect(ctx.count).toHaveBeenCalledTimes(2)
    expect(ctx.count).toHaveBeenCalledWith('foreground')
    expect(ctx.inject).not.toHaveBeenCalled()
  })

  it('进程相同 → 不 count 不 inject', async () => {
    const ctx = makeCtx()
    const runner = vi
      .fn()
      .mockResolvedValueOnce('a.exe|t1')
      .mockResolvedValueOnce('a.exe|t2')
    const src = createForegroundSource(
      () => baseCfg({ mappings: [{ process: 'a.exe', state: 'focus' }] }),
      runner
    )
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    expect(ctx.count).toHaveBeenCalledTimes(1)
    src.poll?.(2000)
    await flush()
    expect(ctx.count).toHaveBeenCalledTimes(1)
    expect(ctx.inject).toHaveBeenCalledTimes(1)
  })

  it('ignore 映射 → count 但无 inject', async () => {
    const ctx = makeCtx()
    const runner = vi
      .fn()
      .mockResolvedValueOnce('a.exe|t1')
      .mockResolvedValueOnce('b.exe|t2')
    const src = createForegroundSource(
      () => baseCfg({ mappings: [{ process: 'b.exe', state: 'ignore' }] }),
      runner
    )
    src.start(ctx)
    src.poll?.(1000)
    await flush()
    src.poll?.(2000)
    await flush()
    expect(ctx.count).toHaveBeenCalledTimes(2)
    expect(ctx.count).toHaveBeenCalledWith('foreground')
    expect(ctx.inject).not.toHaveBeenCalled()
  })
})