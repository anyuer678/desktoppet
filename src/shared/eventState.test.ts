import { describe, expect, it } from 'vitest'
import { filterHistory, groupLabel, isHighPriority, stateOf } from './eventState'
import type { PetEventInfo } from './ipc'

describe('stateOf', () => {
  it('已知类型归类', () => {
    expect(stateOf('cpu_high')).toBe('warning')
    expect(stateOf('success')).toBe('happy')
    expect(stateOf('user_idle')).toBe('sleep')
    expect(stateOf('notice')).toBe('focus')
  })
  it('未知类型 → idle', () => {
    expect(stateOf('whatever')).toBe('idle')
  })
})

describe('groupLabel', () => {
  it('首段映射', () => {
    expect(groupLabel('monitor:cpu')).toBe('系统监控')
    expect(groupLabel('plugin:weather')).toBe('插件')
    expect(groupLabel('clipboard')).toBe('剪贴板')
    expect(groupLabel('folder')).toBe('目录')
    expect(groupLabel('foreground')).toBe('前台应用')
    expect(groupLabel('push:abc')).toBe('推送')
    expect(groupLabel('schedule:1')).toBe('日程')
    expect(groupLabel('autoReport:week')).toBe('自动报告')
  })
  it('未知 source 原样返回', () => {
    expect(groupLabel('strange:x')).toBe('strange:x')
  })
})

describe('isHighPriority', () => {
  it('阈值 8', () => {
    expect(isHighPriority(8)).toBe(true)
    expect(isHighPriority(80)).toBe(true)
    expect(isHighPriority(7)).toBe(false)
    expect(isHighPriority(4)).toBe(false)
  })
})

describe('filterHistory', () => {
  const ev = (over: Partial<PetEventInfo> = {}): PetEventInfo => ({
    source: 'clipboard',
    type: 'clipboard',
    priority: 5,
    durationMs: 8000,
    occurredAt: 1,
    ...over
  })
  it('空筛选全部保留', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'success', source: 'plugin:x' })]
    expect(filterHistory(list, { source: '', state: '', highOnly: false })).toHaveLength(2)
  })
  it('按来源组过滤', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'success', source: 'plugin:x' })]
    expect(filterHistory(list, { source: '插件', state: '', highOnly: false })).toEqual([list[1]])
  })
  it('按状态过滤', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'cpu_high', source: 'monitor:cpu', priority: 9 })]
    expect(filterHistory(list, { source: '', state: 'warning', highOnly: false })).toEqual([list[1]])
  })
  it('仅高优先级', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'cpu_high', source: 'monitor:cpu', priority: 9 })]
    expect(filterHistory(list, { source: '', state: '', highOnly: true })).toEqual([list[1]])
  })
})
