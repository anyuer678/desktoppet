import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createFolderSource, defaultListFiles, folderShouldNotify } from './folderSource'
import type { PassiveFolderConfig } from '../../../shared/ipc'
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

function baseCfg(over: Partial<PassiveFolderConfig> = {}): PassiveFolderConfig {
  return { enabled: true, dir: '', patterns: ['*.png'], debounceMs: 200, ...over }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const tempDirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pet-folder-'))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 清理失败忽略
    }
  }
})

describe('folderShouldNotify', () => {
  it('glob 转正则全匹配', () => {
    expect(folderShouldNotify('a.png', ['*.png'])).toBe(true)
    expect(folderShouldNotify('a.txt', ['*.png'])).toBe(false)
    expect(folderShouldNotify('a-report-1.txt', ['*report*'])).toBe(true)
  })

  it('patterns 为空 → 任意文件名 true', () => {
    expect(folderShouldNotify('anything.png', [])).toBe(true)
    expect(folderShouldNotify('x', [])).toBe(true)
  })

  it('patterns 全为空串 → 视为 ["*"] → true', () => {
    expect(folderShouldNotify('no-ext', ['', ''])).toBe(true)
  })
})

describe('createFolderSource：watch 触发', () => {
  it('start 时基线旧文件不触发', async () => {
    const ctx = makeCtx()
    const dir = makeDir()
    writeFileSync(join(dir, 'old.png'), 'x')
    const source = createFolderSource(() => baseCfg({ dir }), defaultListFiles)
    source.start(ctx)
    await wait(baseCfg().debounceMs + 300)
    source.stop()

    expect(ctx.count).not.toHaveBeenCalled()
    expect(ctx.inject).not.toHaveBeenCalled()
    expect(ctx.notify).not.toHaveBeenCalled()
  })

  it('listFiles 出现新文件 → 防抖后 count/inject/notify 各一次，inject 含 type:folder', async () => {
    const ctx = makeCtx()
    const dir = makeDir()
    writeFileSync(join(dir, 'old.txt'), 'x')
    const debounceMs = 200
    const source = createFolderSource(() => baseCfg({ dir, debounceMs }), defaultListFiles)
    source.start(ctx)
    await wait(50)
    writeFileSync(join(dir, 'new.png'), 'y')
    await wait(debounceMs + 500)
    source.stop()

    expect(ctx.count).toHaveBeenCalledTimes(1)
    expect(ctx.count).toHaveBeenCalledWith('folder')
    expect(ctx.inject).toHaveBeenCalledTimes(1)
    expect(ctx.inject).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'folder', type: 'folder', priority: 5, durationMs: 8000 })
    )
    expect(ctx.notify).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', {
      kind: 'passive',
      reaction: 'folderChange',
      placeholder: 'new.png'
    })
  })

  it('patterns 不匹配的新文件 → 不触发', async () => {
    const ctx = makeCtx()
    const dir = makeDir()
    writeFileSync(join(dir, 'old.png'), 'x')
    const debounceMs = 200
    const source = createFolderSource(() => baseCfg({ dir, debounceMs }), defaultListFiles)
    source.start(ctx)
    await wait(50)
    writeFileSync(join(dir, 'new.txt'), 'y')
    await wait(debounceMs + 500)
    source.stop()

    expect(ctx.count).not.toHaveBeenCalled()
    expect(ctx.inject).not.toHaveBeenCalled()
    expect(ctx.notify).not.toHaveBeenCalled()
  })

  it('防抖窗口内连续多次变更 → 合并为一次触发', async () => {
    const ctx = makeCtx()
    const dir = makeDir()
    writeFileSync(join(dir, 'old.txt'), 'x')
    const debounceMs = 200
    const source = createFolderSource(() => baseCfg({ dir, debounceMs }), defaultListFiles)
    source.start(ctx)
    await wait(50)
    writeFileSync(join(dir, 'new.png'), 'y')
    await wait(50)
    appendFileSync(join(dir, 'new.png'), 'more')
    await wait(debounceMs + 500)
    source.stop()

    expect(ctx.count).toHaveBeenCalledTimes(1)
    expect(ctx.inject).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledTimes(1)
  })

  it('stop 后可再次 start 无异常（幂等/可重启）', async () => {
    const ctx = makeCtx()
    const dir = makeDir()
    const debounceMs = 200
    const source = createFolderSource(() => baseCfg({ dir, debounceMs }), defaultListFiles)
    expect(() => source.start(ctx)).not.toThrow()
    source.stop()
    expect(() => source.stop()).not.toThrow()
    expect(() => source.start(ctx)).not.toThrow()
    await wait(50)
    writeFileSync(join(dir, 'again.png'), 'x')
    await wait(debounceMs + 500)
    source.stop()

    expect(ctx.count).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledTimes(1)
  })
})

describe('createFolderSource：dir 为空', () => {
  it('start 后 ctx.log 收到 warn 且不注册监听（无触发）', async () => {
    const ctx = makeCtx()
    const source = createFolderSource(() => baseCfg({ dir: '' }), defaultListFiles)
    source.start(ctx)
    await wait(300)
    source.stop()

    expect(ctx.log).toHaveBeenCalledWith('warn', '[folder] 未配置目录，跳过')
    expect(ctx.count).not.toHaveBeenCalled()
    expect(ctx.inject).not.toHaveBeenCalled()
    expect(ctx.notify).not.toHaveBeenCalled()
  })
})