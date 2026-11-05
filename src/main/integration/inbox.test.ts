import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { createInboxRuntime, INBOX_MAX_BYTES, listInboxFiles, readInboxFile } from './inbox'

function mk(): string {
  return mkdtempSync(join(tmpdir(), 'dp-inbox-'))
}

describe('readInboxFile', () => {
  it('合法事件返回规范化 body', () => {
    const dir = mk()
    const file = join(dir, 'a.json')
    writeFileSync(file, JSON.stringify({ title: 't', message: 'm', type: 'complete' }))
    expect(readInboxFile(file)).toEqual({
      ok: true,
      body: { title: 't', message: 'm', type: 'complete' }
    })
    rmSync(dir, { recursive: true, force: true })
  })

  it('非法 JSON / 缺字段 / 超限均拒绝', () => {
    const dir = mk()
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{broken')
    expect(readInboxFile(broken).ok).toBe(false)

    const missing = join(dir, 'missing.json')
    writeFileSync(missing, JSON.stringify({ message: 'm' }))
    expect(readInboxFile(missing).error).toContain('title')

    const big = join(dir, 'big.json')
    writeFileSync(big, JSON.stringify({ title: 't', message: 'x'.repeat(INBOX_MAX_BYTES) }))
    expect(readInboxFile(big).error).toContain('上限')
    rmSync(dir, { recursive: true, force: true })
  })

  it('目录不存在/非普通文件返回空列表', () => {
    expect(listInboxFiles(join(tmpdir(), 'dp-no-inbox-xyz'))).toEqual([])
  })
})

describe('createInboxRuntime', () => {
  it('合法文件投递后删除，非法文件改名为 .bad', () => {
    const dir = mk()
    const good = join(dir, '01-good.json')
    const bad = join(dir, '02-bad.json')
    writeFileSync(good, JSON.stringify({ title: '构建完成', message: '可以发布' }))
    writeFileSync(bad, '{broken')
    const fired: unknown[] = []
    const log = vi.fn()
    const rt = createInboxRuntime({ dir: () => dir, fire: (b) => fired.push(b), log })

    expect(rt.pollOnce()).toBe(1)
    expect(fired).toEqual([{ title: '构建完成', message: '可以发布' }])
    expect(listInboxFiles(dir)).toEqual([])
    expect(log).toHaveBeenCalled()
    // 原文保留在 .bad 中便于排查
    const quarantined = readdirSync(dir).filter((n) => n.endsWith('.bad'))
    expect(quarantined).toHaveLength(1)
    expect(readFileSync(join(dir, quarantined[0]), 'utf-8')).toBe('{broken')
    rmSync(dir, { recursive: true, force: true })
  })

  it('处理失败时不会重复投递', () => {
    const dir = mk()
    const file = join(dir, 'a.json')
    writeFileSync(file, JSON.stringify({ title: 't', message: 'm' }))
    const fire = vi.fn()
    const rt = createInboxRuntime({ dir: () => dir, fire, log: vi.fn() })
    rt.pollOnce()
    rt.pollOnce()
    expect(fire).toHaveBeenCalledTimes(1)
    rmSync(dir, { recursive: true, force: true })
  })
})
