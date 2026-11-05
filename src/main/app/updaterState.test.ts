import { describe, expect, it } from 'vitest'
import { applyUpdaterEvent, initialUpdaterStatus } from './updaterState'

describe('updaterState 状态迁移', () => {
  it('安装版初始为 idle，开发版为 unsupported', () => {
    expect(initialUpdaterStatus(true)).toEqual({ phase: 'idle' })
    expect(initialUpdaterStatus(false)).toEqual({ phase: 'unsupported' })
  })

  it('unsupported 不被任何事件改变', () => {
    const start = initialUpdaterStatus(false)
    expect(applyUpdaterEvent(start, { type: 'checking' })).toEqual(start)
    expect(applyUpdaterEvent(start, { type: 'available', version: '1.3.0' })).toEqual(start)
  })

  it('检查 → 发现 → 下载进度 → 下载完成', () => {
    let s = initialUpdaterStatus(true)
    s = applyUpdaterEvent(s, { type: 'checking' })
    expect(s.phase).toBe('checking')
    s = applyUpdaterEvent(s, { type: 'available', version: '1.3.0' })
    expect(s).toEqual({ phase: 'available', version: '1.3.0' })
    s = applyUpdaterEvent(s, { type: 'progress', percent: 42.4 })
    expect(s).toEqual({ phase: 'downloading', version: '1.3.0', percent: 42 })
    s = applyUpdaterEvent(s, { type: 'downloaded', version: '1.3.0' })
    expect(s).toEqual({ phase: 'downloaded', version: '1.3.0' })
  })

  it('已是新版回到 idle 并清空版本', () => {
    let s = applyUpdaterEvent(initialUpdaterStatus(true), { type: 'available', version: '1.3.0' })
    s = applyUpdaterEvent(s, { type: 'not-available' })
    expect(s).toEqual({ phase: 'idle' })
  })

  it('无可用更新时忽略下载进度', () => {
    const s = applyUpdaterEvent(initialUpdaterStatus(true), { type: 'progress', percent: 10 })
    expect(s).toEqual({ phase: 'idle' })
  })

  it('进度夹取 0~100，非法数字归零', () => {
    let s = applyUpdaterEvent(initialUpdaterStatus(true), { type: 'available', version: '2.0.0' })
    expect(applyUpdaterEvent(s, { type: 'progress', percent: -5 }).percent).toBe(0)
    expect(applyUpdaterEvent(s, { type: 'progress', percent: 250 }).percent).toBe(100)
    expect(applyUpdaterEvent(s, { type: 'progress', percent: Number.NaN }).percent).toBe(0)
  })

  it('出错保留已发现的版本，便于界面提示重试', () => {
    let s = applyUpdaterEvent(initialUpdaterStatus(true), { type: 'available', version: '1.3.0' })
    s = applyUpdaterEvent(s, { type: 'error', message: 'network down' })
    expect(s).toEqual({ phase: 'error', version: '1.3.0', message: 'network down' })
  })
})
