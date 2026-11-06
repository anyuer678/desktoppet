import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EMOTION_CONFIG, type EmotionConfig } from '../../shared/emotion'
import { createEmotionRuntime } from './emotionRuntime'

describe('emotionRuntime', () => {
  let dir: string
  let role: string
  let config: EmotionConfig

  function makeRuntime() {
    return createEmotionRuntime({
      getRoleId: () => role,
      getConfig: () => config,
      dir: () => dir,
      notifyPet: vi.fn(),
      notifyCenter: vi.fn(),
      log: vi.fn()
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 10, 0, 0))
    dir = mkdtempSync(join(tmpdir(), 'dp-emotion-'))
    role = 'rabbit'
    config = DEFAULT_EMOTION_CONFIG
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('初始为中性 0，互动/开心加分，告警扣分', () => {
    const rt = makeRuntime()
    rt.init()
    expect(rt.status()).toMatchObject({ score: 0, label: '平静', enabled: true })
    expect(rt.record('happy').score).toBe(4)
    expect(rt.record('interact').score).toBe(6)
    expect(rt.record('warning').score).toBe(2)
  })

  it('按小时向 0 衰减', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record('happy') // 4
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0)) // +2h，衰减 4
    expect(rt.status().score).toBe(0)
  })

  it('心情按角色分离并持久化', () => {
    const rt = makeRuntime()
    rt.init()
    rt.record('happy')
    role = 'cat'
    rt.switchRole()
    expect(rt.status().score).toBe(0)
    rt.record('warning')
    expect(JSON.parse(readFileSync(join(dir, 'rabbit.json'), 'utf-8')).score).toBe(4)
    expect(JSON.parse(readFileSync(join(dir, 'cat.json'), 'utf-8')).score).toBe(-4)

    // 新实例恢复当前角色
    const rt2 = makeRuntime()
    rt2.init()
    expect(rt2.status().score).toBe(-4)
  })

  it('禁用 emotion 时不记录不落盘', () => {
    config = { ...DEFAULT_EMOTION_CONFIG, enabled: false }
    const rt = makeRuntime()
    rt.init()
    expect(rt.status().enabled).toBe(false)
    expect(rt.record('happy').score).toBe(0)
  })
})
