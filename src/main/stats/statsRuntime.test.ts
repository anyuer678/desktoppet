import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStatsRuntime } from './statsRuntime'
import { addStateTime, countEvent, countInteraction } from './dailyStats'
import type { LogFn } from '../logging/logger'

const paths = vi.hoisted(() => ({ root: '' }))

vi.mock('../app/paths', () => ({
  statsRootPath: () => paths.root
}))

describe('statsRuntime', () => {
  let activeId: string
  let log: LogFn

  function makeRuntime(): ReturnType<typeof createStatsRuntime> {
    return createStatsRuntime({ getActiveCharacterId: () => activeId, log })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 10, 0, 0))
    paths.root = mkdtempSync(join(tmpdir(), 'dp-stats-rt-'))
    activeId = 'rabbit'
    log = vi.fn() as unknown as LogFn
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(paths.root, { recursive: true, force: true })
  })

  it('init 指向当前角色/今日并创建空统计', () => {
    const rt = makeRuntime()
    rt.init()
    expect(rt.roleId()).toBe('rabbit')
    expect(rt.date()).toBe('2026-08-06')
    expect(rt.dir()).toBe(join(paths.root, 'rabbit'))
    expect(rt.today()?.secondsByState).toEqual({})
    rt.dispose()
  })

  it('record 累加状态/事件/互动，flush 落盘', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'focus', 30, Date.now()))
    rt.record((s) => countEvent(s, 'push'))
    rt.record((s) => countInteraction(s, 'click'))
    rt.flush()

    const file = join(paths.root, 'rabbit', '2026-08-06.json')
    const saved = JSON.parse(readFileSync(file, 'utf-8'))
    expect(saved.secondsByState.focus).toBe(30)
    expect(saved.events.push).toBe(1)
    expect(saved.interactions.click).toBe(1)
    expect(rt.today()?.secondsByState.focus).toBe(30)
    rt.dispose()
  })

  it('switchRole 先落盘旧角色，再切到新角色目录', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'idle', 12, Date.now()))
    rt.flush()
    activeId = 'cat'
    rt.switchRole()
    expect(rt.roleId()).toBe('cat')
    expect(rt.dir()).toBe(join(paths.root, 'cat'))
    expect(rt.today()?.secondsByState).toEqual({})
    rt.record((s) => addStateTime(s, 'happy', 5, Date.now()))
    rt.flush()

    const oldFile = JSON.parse(readFileSync(join(paths.root, 'rabbit', '2026-08-06.json'), 'utf-8'))
    const newFile = JSON.parse(readFileSync(join(paths.root, 'cat', '2026-08-06.json'), 'utf-8'))
    expect(oldFile.secondsByState.idle).toBe(12)
    expect(newFile.secondsByState.happy).toBe(5)
    rt.dispose()
  })

  it('ensureDate 跨日切换日期并载入新文件', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'sleep', 20, Date.now()))
    rt.flush()

    vi.setSystemTime(new Date(2026, 7, 7, 0, 0, 5))
    rt.ensureDate(Date.now())
    expect(rt.date()).toBe('2026-08-07')
    expect(rt.today()?.secondsByState).toEqual({})
    rt.record((s) => addStateTime(s, 'idle', 7, Date.now()))
    rt.flush()

    expect(existsSync(join(paths.root, 'rabbit', '2026-08-06.json'))).toBe(true)
    const next = JSON.parse(readFileSync(join(paths.root, 'rabbit', '2026-08-07.json'), 'utf-8'))
    expect(next.secondsByState.idle).toBe(7)
    rt.dispose()
  })

  it('ensureDate 检测到外部切角色后切换目录', () => {
    const rt = makeRuntime()
    rt.init()
    activeId = 'dog'
    rt.ensureDate(Date.now())
    expect(rt.roleId()).toBe('dog')
    expect(rt.dir()).toBe(join(paths.root, 'dog'))
    rt.dispose()
  })

  it('deleteDay 删除文件并重置今日内存', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'focus', 10, Date.now()))
    rt.flush()
    rt.deleteDay('2026-08-06')
    expect(existsSync(join(paths.root, 'rabbit', '2026-08-06.json'))).toBe(false)
    expect(rt.today()?.secondsByState).toEqual({})
    rt.dispose()
  })

  it('clearAll 删除全部日文件并重置今日', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'focus', 10, Date.now()))
    rt.flush()
    vi.setSystemTime(new Date(2026, 7, 5, 23, 0, 0))
    rt.ensureDate(Date.now())
    rt.record((s) => addStateTime(s, 'idle', 5, Date.now()))
    rt.flush()

    const deleted = rt.clearAll()
    expect(deleted).toBe(2)
    expect(rt.today()?.secondsByState).toEqual({})
    rt.dispose()
  })

  it('dispose 清理防抖定时器并同步落盘', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record((s) => addStateTime(s, 'idle', 9, Date.now()))
    rt.dispose()
    const saved = JSON.parse(readFileSync(join(paths.root, 'rabbit', '2026-08-06.json'), 'utf-8'))
    expect(saved.secondsByState.idle).toBe(9)
  })
})
